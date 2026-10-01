import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { computeMaterialRequirements } from "../src/lib/materials/requirements";
import { computeOrderMaterialReadiness } from "../src/lib/operations/planning";
import { canReleaseBatch } from "../src/lib/batches/service";
import { buildTraceabilityAttention, buildTraceabilityIndexes, investigateEntity } from "../src/lib/traceability/service";
import { assessTraceabilityConfidence, computeImpactScope } from "../src/lib/traceability/impact";
import {
  assertTraceabilityEntityScope,
  getTraceabilitySnapshot,
  resolveTraceabilityFilters,
} from "../src/lib/server/traceability";
import { getOperationsPlanner, resolvePlanningWindow } from "../src/lib/server/operations";
import type { TenantContext } from "../src/lib/server/errors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase34Verify(prisma: PrismaClient) {
  const sources = [
    "src/lib/traceability/service.ts",
    "src/lib/server/traceability.ts",
    "src/components/traceability/TraceabilityWorkspace.tsx",
    "src/app/(workspace)/traceability/page.tsx",
  ]
    .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
    .join("\n");
  assert(!/openai/i.test(sources), "Phase 34 performs ZERO OpenAI calls");

  assert(computeImpactScope({ batchCount: 0, orderCount: 0, customerCount: 0, hasKnownLinks: false }) === "UNKNOWN", "Unknown scope when no links");
  assert(computeImpactScope({ batchCount: 2, orderCount: 2, customerCount: 2, hasKnownLinks: true }) === "SIGNIFICANT_IMPACT", "Significant scope");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  assert(tenant && tenantB, "Demo tenants exist");
  const ctxA: TenantContext = { tenantId: tenant.id, userId: null, role: "MANAGER" };
  const ctxB: TenantContext = { tenantId: tenantB.id, userId: null, role: "MANAGER" };

  const snapshot = await getTraceabilitySnapshot(ctxA, resolveTraceabilityFilters({}));
  assert(snapshot.kpis.length >= 4, "Traceability KPI strip");
  assert(snapshot.options.length > 0, "Entity options available");

  const demoBatch = snapshot.options.find((row) => row.type === "batch" && row.label.startsWith("LAB-"));
  assert(demoBatch, "Demo production batch available");
  const batchInvestigation = await getTraceabilitySnapshot(
    ctxA,
    resolveTraceabilityFilters({ batch: demoBatch!.id })
  );
  assert(batchInvestigation.investigation, "Batch investigation loads");
  assert(batchInvestigation.investigation!.path.some((node) => node.kind === "production_batch"), "Batch path includes production batch");
  assert(
    batchInvestigation.investigation!.coverage.some((row) => row.coverage === "PARTIAL" || row.coverage === "NOT_RECORDED"),
    "Batch investigation exposes partial or missing links honestly"
  );
  assert(batchInvestigation.investigation!.impact.allocationNote.includes("Batch-to-order allocation not recorded"), "Allocation disclaimer present");

  const demoLot = snapshot.options.find((row) => row.type === "lot");
  if (demoLot) {
    const lotInvestigation = await getTraceabilitySnapshot(ctxA, resolveTraceabilityFilters({ lot: demoLot.id }));
    assert(lotInvestigation.investigation, "Lot investigation loads");
    assert(lotInvestigation.investigation!.direction === "forward", "Lot uses forward trace");
  }

  const demoOrder = snapshot.options.find((row) => row.type === "order");
  if (demoOrder) {
    const orderInvestigation = await getTraceabilitySnapshot(ctxA, resolveTraceabilityFilters({ order: demoOrder.id }));
    assert(orderInvestigation.investigation, "Order investigation loads");
    assert(orderInvestigation.investigation!.direction === "reverse", "Order uses reverse trace");
  }

  await assertTraceabilityEntityScope(ctxA, "batch", demoBatch!.id);
  let isolationFailed = false;
  try {
    await assertTraceabilityEntityScope(ctxB, "batch", demoBatch!.id);
  } catch {
    isolationFailed = true;
  }
  assert(isolationFailed, "Tenant B cannot inspect tenant A batch");

  const graph = buildTraceabilityIndexes({
    lots: [
      {
        id: "lot-1",
        batchCode: "RM-TEST-001",
        productId: "api",
        productName: "API",
        productSku: "API",
        supplierId: "sup-1",
        supplierName: "Acme Chemicals",
        quantity: 100,
        receivedAt: "2026-01-01T00:00:00.000Z",
        receiptReference: "RCV-1",
      },
    ],
    batches: [
      {
        id: "batch-1",
        batchNumber: "B-2026-014",
        productId: "fg",
        productName: "Paracetamol 500mg",
        productSku: "PARA-500",
        qualityStatus: "RELEASED",
        plannedQuantity: 1000,
        producedQuantity: 900,
        productionOrderId: "po-1",
        orderNumber: "PO-900",
        manufacturingCompleted: true,
        inputLots: [{ inventoryLotId: "lot-1", quantityUsed: 10 }],
      },
      {
        id: "batch-2",
        batchNumber: "B-2026-015",
        productId: "fg",
        productName: "Paracetamol 500mg",
        productSku: "PARA-500",
        qualityStatus: "PENDING_REVIEW",
        plannedQuantity: 1000,
        producedQuantity: null,
        productionOrderId: "po-2",
        orderNumber: "PO-901",
        manufacturingCompleted: true,
        inputLots: [],
      },
    ],
    orders: [
      {
        id: "order-1",
        reference: "SO-1042",
        customerId: "cust-1",
        customerName: "Customer A",
        orderedAt: "2026-02-01T00:00:00.000Z",
        productIds: ["fg"],
      },
    ],
    customers: [{ id: "cust-1", name: "Customer A" }],
    boms: [{ productId: "fg", componentId: "api" }],
  });

  const forward = investigateEntity(graph, "lot", "lot-1");
  assert(forward?.path.some((node) => node.kind === "production_batch"), "Forward trace reaches batch");
  assert(
    forward?.path.some((node) => node.kind === "production_batch" && node.sublabel?.includes("used 10")),
    "Phase 33 quantity used appears on the forward trace"
  );
  assert(forward?.path.some((node) => node.kind === "customer"), "Forward trace reaches customer exposure");
  assert(forward?.impact.affectedProductionBatches === 1, "Forward impact counts batch");

  const mixed = buildTraceabilityIndexes({
    lots: [
      {
        id: "lot-a",
        batchCode: "L1",
        productId: "api",
        productName: "API",
        productSku: "API",
        supplierId: null,
        supplierName: null,
        quantity: 1,
        receivedAt: "2026-01-01T00:00:00.000Z",
        receiptReference: null,
      },
    ],
    batches: [
      {
        id: "batch-mix",
        batchNumber: "B-MIX",
        productId: "fg",
        productName: "Finished",
        productSku: "FG",
        qualityStatus: "RELEASED",
        plannedQuantity: 10,
        producedQuantity: 10,
        productionOrderId: "po",
        orderNumber: "PO",
        manufacturingCompleted: true,
        inputLots: [
          { inventoryLotId: "lot-a", quantityUsed: 4 },
          { inventoryLotId: "lot-a", quantityUsed: 6 },
          { inventoryLotId: null, quantityUsed: null },
        ],
      },
    ],
    orders: [],
    customers: [],
    boms: [],
  });
  const mixedTrace = investigateEntity(mixed, "batch", "batch-mix");
  assert(mixedTrace?.path.some((node) => node.sublabel?.includes("used 10")), "Multiple input rows for one lot sum quantity used");
  assert(
    mixedTrace?.path.some((node) => node.coverage === "NOT_RECORDED" && node.label.includes("not linked")),
    "Unlinked input row stays NOT_RECORDED"
  );

  const manyReleased = buildTraceabilityIndexes({
    lots: [],
    batches: ["B1", "B2"].map((batchNumber, index) => ({
      id: `released-${index}`,
      batchNumber,
      productId: "fg",
      productName: "Finished",
      productSku: "FG",
      qualityStatus: "RELEASED" as const,
      plannedQuantity: 1,
      producedQuantity: 1,
      productionOrderId: `po-${index}`,
      orderNumber: `PO-${index}`,
      manufacturingCompleted: true,
      inputLots: [],
    })),
    orders: [
      {
        id: "order-many",
        reference: "SO-MANY",
        customerId: "cust-many",
        customerName: "Customer",
        orderedAt: "2026-02-01T00:00:00.000Z",
        productIds: ["fg"],
      },
    ],
    customers: [{ id: "cust-many", name: "Customer" }],
    boms: [],
  });
  assert(
    buildTraceabilityAttention(manyReleased).some((item) => item.id === "trace-allocation-many"),
    "Multiple partial allocations aggregate into one attention item"
  );

  const reverse = investigateEntity(graph, "order", "order-1");
  assert(reverse?.direction === "reverse", "Reverse direction");
  assert(reverse?.path.some((node) => node.kind === "material_lot"), "Reverse trace reaches material lot");

  const attention = buildTraceabilityAttention(graph);
  assert(attention.some((item) => item.title.includes("input-lot")), "Missing input lot attention generated");
  assert(!canReleaseBatch({ qualityStatus: "RELEASED", manufacturingStatus: "COMPLETED", productionCompleted: true }), "Phase 33 regression");

  const requirements = computeMaterialRequirements({
    orders: [
      {
        id: "po-1",
        orderNumber: "PO-1",
        productId: "fg",
        productName: "Finished",
        quantity: 1000,
        dueDate: "2026-03-01T00:00:00.000Z",
        priority: "NORMAL",
        status: "SCHEDULED",
        plannedStart: "2026-03-01T08:00:00.000Z",
        plannedEnd: "2026-03-01T16:00:00.000Z",
      },
    ],
    boms: [{ productId: "fg", componentId: "api", quantityPer: 0.01 }],
    identities: [
      { id: "api", sku: "API", name: "API", unit: "kg", safetyStock: 0 },
      { id: "fg", sku: "FG", name: "Finished", unit: "unit", safetyStock: 0 },
    ],
    lots: [{ productId: "api", batchCode: "API-LOT", quantity: 800, expiryDate: "2027-01-01T00:00:00.000Z", warehouseName: "RM" }],
    receipts: [],
  });
  assert(requirements.some((row) => row.sku === "API"), "Phase 32 MRP regression");

  const readiness = computeOrderMaterialReadiness(requirements, "po-1", true);
  assert(readiness.state !== undefined, "Phase 31 material readiness regression");

  const planner = await getOperationsPlanner(ctxA, resolvePlanningWindow({ weeks: "1" }));
  assert(planner.kpis.length > 0, "Phase 31 operations regression");

  const confidence = assessTraceabilityConfidence([
    { id: "1", link: "A → B", coverage: "TRACEABLE", note: "ok" },
    { id: "2", link: "B → C", coverage: "PARTIAL", note: "partial" },
  ]);
  assert(confidence === "PARTIAL", "Partial confidence when mixed coverage");

  console.log("Phase 34 verification passed.");
}

if (process.argv[1]?.includes("verify-phase34")) {
  const prisma = new PrismaClient();
  runPhase34Verify(prisma)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
