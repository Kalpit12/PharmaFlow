import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  buildBatchAttention,
  buildMaterialTrace,
  canPlaceBatchOnHold,
  canRejectBatch,
  canReleaseBatch,
  computeBatchQuantities,
  validateHoldReason,
} from "../src/lib/batches/service";
import { computeMaterialRequirements } from "../src/lib/materials/requirements";
import { computeOrderMaterialReadiness } from "../src/lib/operations/planning";
import {
  getBatchesSnapshot,
  holdProductionBatch,
  releaseProductionBatch,
  rejectProductionBatch,
  resolveBatchesFilters,
} from "../src/lib/server/batches";
import type { TenantContext } from "../src/lib/server/errors";
import { getOperationsPlanner, resolvePlanningWindow } from "../src/lib/server/operations";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase33Verify(prisma: PrismaClient) {
  const sources = [
    "src/lib/batches/service.ts",
    "src/lib/server/batches.ts",
    "src/components/batches/BatchesWorkspace.tsx",
    "src/app/(workspace)/batches/page.tsx",
  ]
    .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
    .join("\n");
  assert(!/openai/i.test(sources), "Phase 33 performs ZERO OpenAI calls");

  assert(!canReleaseBatch({ qualityStatus: "RELEASED", manufacturingStatus: "COMPLETED", productionCompleted: true }), "Released cannot release again");
  assert(!canRejectBatch({ qualityStatus: "REJECTED", manufacturingStatus: "COMPLETED", productionCompleted: true }), "Rejected cannot reject again");
  assert(canPlaceBatchOnHold({ qualityStatus: "PENDING_REVIEW", manufacturingStatus: "COMPLETED", productionCompleted: true }), "Hold allowed before terminal states");
  assert(!canPlaceBatchOnHold({ qualityStatus: "RELEASED", manufacturingStatus: "COMPLETED", productionCompleted: true }), "Hold blocked after release");
  assert(canReleaseBatch({ qualityStatus: "ON_HOLD", manufacturingStatus: "COMPLETED", productionCompleted: true }), "Release from hold");
  assert(!canReleaseBatch({ qualityStatus: "PENDING_REVIEW", manufacturingStatus: "IN_PROGRESS", productionCompleted: false }), "Release requires completed production");
  assert(validateHoldReason("ab") !== null, "Hold reason minimum length");
  assert(validateHoldReason("Awaiting laboratory result") === null, "Valid hold reason");

  const qty = computeBatchQuantities({ plannedQuantity: 1000, producedQuantity: null });
  assert(qty.producedLabel === "NOT_RECORDED", "Produced NOT_RECORDED when unavailable");
  const qty2 = computeBatchQuantities({ plannedQuantity: 1000, producedQuantity: 900 });
  assert(qty2.remainingQuantity === 100 && qty2.completionPercent === 90, "Completion math");

  const trace = buildMaterialTrace({
    productId: "fg",
    plannedQuantity: 1000,
    boms: [{ componentId: "api", quantityPer: 0.01, sku: "API", name: "API", unit: "kg" }],
    inputLots: [],
  });
  assert(trace[0]?.lotCode === "NOT_RECORDED" && trace[0]?.quantityUsed === "NOT_RECORDED", "NOT_RECORDED lot consumption");

  const attention = buildBatchAttention([
    {
      id: "1",
      batchNumber: "LAB-2026-003",
      qualityStatus: "ON_HOLD",
      manufacturingStatus: "COMPLETED",
      holdReason: "Awaiting laboratory result",
      plannedQuantity: 1000,
      producedQuantity: 1000,
    },
  ]);
  assert(attention.some((row) => row.severity === "CRITICAL"), "Management attention for completed hold");
  const twoAwaiting = buildBatchAttention([
    {
      id: "a",
      batchNumber: "LAB-A",
      qualityStatus: "PENDING_REVIEW",
      manufacturingStatus: "COMPLETED",
      holdReason: null,
      plannedQuantity: 100,
      producedQuantity: 100,
    },
    {
      id: "b",
      batchNumber: "LAB-B",
      qualityStatus: "PENDING_REVIEW",
      manufacturingStatus: "COMPLETED",
      holdReason: null,
      plannedQuantity: 100,
      producedQuantity: 100,
    },
  ]);
  assert(twoAwaiting.some((row) => row.id === "batch-review-queue"), "Two awaiting-review batches still raise attention");
  const multiLot = buildMaterialTrace({
    productId: "fg",
    plannedQuantity: 100,
    boms: [{ componentId: "api", quantityPer: 1, sku: "API", name: "API", unit: "kg" }],
    inputLots: [
      { productId: "api", inventoryLot: { batchCode: "L1" }, quantityUsed: 10 },
      { productId: "api", inventoryLot: { batchCode: "L2" }, quantityUsed: 5 },
    ],
  });
  assert(multiLot[0]?.lotCode === "L1, L2" && multiLot[0]?.quantityUsed === 15, "Multiple input lots are retained");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  assert(tenant && tenantB, "Demo tenants exist");
  const ctxA: TenantContext = { tenantId: tenant.id, userId: null, role: "MANAGER" };
  const ctxB: TenantContext = { tenantId: tenantB.id, userId: null, role: "MANAGER" };

  const snapshotA = await getBatchesSnapshot(ctxA, resolveBatchesFilters({}));
  assert(snapshotA.batches.length >= 1, "Demo batches seeded");
  assert(snapshotA.kpis.length === 5, "Batch metric strip");
  const uniqueNumbers = new Set(snapshotA.batches.map((row) => row.batchNumber));
  assert(uniqueNumbers.size === snapshotA.batches.length, "Batch numbers unique within tenant");

  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
  const product = await prisma.product.findFirst({ where: { tenantId: tenant.id } });
  assert(user && product, "Demo user and product exist");

  const testOrder = await prisma.productionOrder.create({
    data: {
      tenantId: tenant.id,
      orderNumber: `PH33-${Date.now()}`,
      productId: product.id,
      quantity: 500,
      priority: "NORMAL",
      status: "COMPLETED",
      dueDate: new Date(),
      durationMinutes: 480,
    },
  });
  const testBatch = await prisma.productionBatch.create({
    data: {
      tenantId: tenant.id,
      productionOrderId: testOrder.id,
      batchNumber: `PH33-B-${Date.now()}`,
      plannedQuantity: 500,
      producedQuantity: 500,
      qualityStatus: "PENDING_REVIEW",
      productionCompletedAt: new Date(),
    },
  });
  const actor: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };

  await holdProductionBatch(actor, testBatch.id, "Packaging inspection");
  let row = (await getBatchesSnapshot(actor, resolveBatchesFilters({ batch: testBatch.id }))).batches[0];
  assert(row?.qualityStatus === "ON_HOLD", "Hold transition");

  await releaseProductionBatch(actor, testBatch.id);
  row = (await getBatchesSnapshot(actor, resolveBatchesFilters({ batch: testBatch.id }))).batches[0];
  assert(row?.qualityStatus === "RELEASED", "Release transition");

  let invalid = false;
  try {
    await holdProductionBatch(actor, testBatch.id, "Should fail");
  } catch {
    invalid = true;
  }
  assert(invalid, "Invalid hold after release rejected");

  const rejectOrder = await prisma.productionOrder.create({
    data: {
      tenantId: tenant.id,
      orderNumber: `PH33-R-${Date.now()}`,
      productId: product.id,
      quantity: 300,
      priority: "NORMAL",
      status: "COMPLETED",
      dueDate: new Date(),
      durationMinutes: 360,
    },
  });
  const rejectBatch = await prisma.productionBatch.create({
    data: {
      tenantId: tenant.id,
      productionOrderId: rejectOrder.id,
      batchNumber: `PH33-RB-${Date.now()}`,
      plannedQuantity: 300,
      producedQuantity: 280,
      qualityStatus: "PENDING_REVIEW",
      productionCompletedAt: new Date(),
    },
  });
  await rejectProductionBatch(actor, rejectBatch.id, "Manufacturing exception");
  row = (await getBatchesSnapshot(actor, resolveBatchesFilters({ batch: rejectBatch.id }))).batches[0];
  assert(row?.qualityStatus === "REJECTED", "Reject transition");

  await prisma.productionBatch.deleteMany({ where: { id: { in: [testBatch.id, rejectBatch.id] } } });
  await prisma.productionOrder.deleteMany({ where: { id: { in: [testOrder.id, rejectOrder.id] } } });

  const snapshotB = await getBatchesSnapshot(ctxB, resolveBatchesFilters({}));
  assert(snapshotB.batches.every((row) => !row.batchNumber.startsWith("LAB-2026")), "Tenant B batch isolation");

  const planner = await getOperationsPlanner(ctxA, resolvePlanningWindow({ weeks: "1" }));
  assert(planner.planningAttention.some((row) => row.id.startsWith("batch-")) || snapshotA.attention.length === 0, "Batch attention integrated into operations");

  const mrpRows = computeMaterialRequirements({
    now: new Date("2026-08-17T12:00:00.000Z"),
    identities: [{ id: "api", sku: "API-X", name: "API X", unit: "kg", safetyStock: 0 }],
    boms: [{ productId: "fg", componentId: "api", quantityPer: 0.01 }],
    orders: [
      {
        id: "po-1",
        orderNumber: "PO-1",
        productId: "fg",
        productName: "Finished",
        quantity: 100_000,
        dueDate: "2026-08-22T00:00:00.000Z",
        priority: "HIGH",
        status: "SCHEDULED",
        plannedStart: "2026-08-20T08:00:00.000Z",
        plannedEnd: "2026-08-21T16:00:00.000Z",
      },
    ],
    lots: [{ productId: "api", batchCode: "API-LOT", quantity: 800, expiryDate: "2027-01-01T00:00:00.000Z", warehouseName: "RM" }],
    receipts: [],
  });
  const readiness = computeOrderMaterialReadiness(mrpRows, "po-1", true);
  assert(readiness.state === "SHORTAGE", "Phase 32 MRP regression preserved");

  console.log("Phase 33 verification passed.");
}

if (process.argv[1]?.includes("verify-phase33")) {
  const prisma = new PrismaClient();
  runPhase33Verify(prisma)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
