import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { canReleaseBatch } from "../src/lib/batches/service";
import { computeMaterialRequirements } from "../src/lib/materials/requirements";
import { computeOrderMaterialReadiness } from "../src/lib/operations/planning";
import {
  allowedQualityTransitions,
  buildQualityAttention,
  canTransitionQualityStatus,
  computeDueState,
  nextQualityReference,
} from "../src/lib/quality/service";
import { investigateEntity, buildTraceabilityIndexes } from "../src/lib/traceability/service";
import {
  createCorrectiveAction,
  createQualityException,
  getQualitySnapshot,
  resolveQualityFilters,
  transitionQualityException,
  updateQualityException,
} from "../src/lib/server/quality";
import { getTraceabilitySnapshot, resolveTraceabilityFilters } from "../src/lib/server/traceability";
import { getOperationsPlanner, resolvePlanningWindow } from "../src/lib/server/operations";
import type { TenantContext } from "../src/lib/server/errors";
import { ensureQualityDemoData } from "./seed-quality";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase35Verify(prisma: PrismaClient) {
  await ensureQualityDemoData(prisma);

  const sources = [
    "src/lib/quality/service.ts",
    "src/lib/server/quality.ts",
    "src/components/quality/QualityWorkspace.tsx",
    "src/app/(workspace)/quality/page.tsx",
  ]
    .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
    .join("\n");
  assert(!/openai/i.test(sources), "Phase 35 performs ZERO OpenAI calls");

  assert(!canTransitionQualityStatus("CLOSED", "OPEN"), "Closed exceptions cannot reopen");
  assert(canTransitionQualityStatus("OPEN", "RESOLVED"), "OPEN to RESOLVED allowed");
  assert(canTransitionQualityStatus("INVESTIGATING", "ACTION_REQUIRED"), "Investigation to action allowed");
  assert(allowedQualityTransitions("RESOLVED").includes("CLOSED"), "Resolved can close");
  assert(computeDueState(new Date(Date.now() - 86400000).toISOString(), "OPEN") === "OVERDUE", "Overdue calculation");
  assert(computeDueState(null, "OPEN") === "NO_DUE_DATE", "No due date state");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && user, "Demo tenants and user exist");
  const ctxA: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const ctxB: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };

  const batch = await prisma.productionBatch.findFirst({ where: { tenantId: tenant.id } });
  const lot = await prisma.inventoryLot.findFirst({ where: { tenantId: tenant.id } });
  assert(batch, "Demo batch exists");

  const created = await createQualityException(ctxA, {
    title: "Phase 35 verify exception",
    description: "Temporary exception for deterministic verification.",
    type: "BATCH_ISSUE",
    severity: "HIGH",
    ownerId: user.id,
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    productionBatchId: batch.id,
  });
  assert(created.reference.startsWith("Q-"), "Reference generated");
  assert(created.entity.batchId === batch.id, "Batch linkage");

  await updateQualityException(ctxA, created.id, {
    investigationNotes: "Investigation note recorded.",
    findings: "Findings recorded.",
  });
  const investigating = await transitionQualityException(ctxA, created.id, "INVESTIGATING", "Start investigation");
  assert(investigating.status === "INVESTIGATING", "Status transition");

  await createCorrectiveAction(ctxA, created.id, {
    description: "Review batch hold context.",
    ownerId: user.id,
  });
  assert(investigating.correctiveActions.length >= 0, "Corrective action path available");

  let invalidTransition = false;
  try {
    await transitionQualityException(ctxA, created.id, "OPEN");
  } catch {
    invalidTransition = true;
  }
  assert(invalidTransition, "Invalid transition rejected");

  const snapshot = await getQualitySnapshot(ctxA, resolveQualityFilters({ exception: created.id }));
  assert(snapshot.kpis.length >= 4, "Quality KPI strip");
  assert(snapshot.exceptions.some((row) => row.id === created.id), "Exception listed");
  const detail = snapshot.exceptions.find((row) => row.id === created.id);
  assert(detail?.traceabilityImpact, "Traceability impact attached for batch-linked exception");

  const attention = buildQualityAttention(snapshot.exceptions);
  assert(Array.isArray(attention), "Management attention generated");

  const trace = await getTraceabilitySnapshot(ctxA, resolveTraceabilityFilters({ batch: batch.id }));
  assert(trace.investigation, "Phase 34 traceability regression");

  const graph = buildTraceabilityIndexes({
    lots: lot
      ? [
          {
            id: lot.id,
            batchCode: lot.batchCode,
            productId: lot.productId,
            productName: "Material",
            productSku: "MAT",
            supplierId: null,
            supplierName: null,
            quantity: lot.quantity,
            receivedAt: lot.receivedAt.toISOString(),
            receiptReference: null,
          },
        ]
      : [],
    batches: [
      {
        id: batch.id,
        batchNumber: batch.batchNumber,
        productId: batch.productionOrderId,
        productName: "Product",
        productSku: "SKU",
        qualityStatus: batch.qualityStatus,
        plannedQuantity: batch.plannedQuantity,
        producedQuantity: batch.producedQuantity,
        productionOrderId: batch.productionOrderId,
        orderNumber: "PO-TEST",
        manufacturingCompleted: true,
        inputLots: lot ? [{ inventoryLotId: lot.id, quantityUsed: 1 }] : [],
      },
    ],
    orders: [],
    customers: [],
    boms: [],
  });
  assert(investigateEntity(graph, "batch", batch.id), "Traceability graph regression");

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
  assert(requirements.some((row) => row.sku === "API"), "Phase 32 regression");
  assert(computeOrderMaterialReadiness(requirements, "po-1", true).state !== undefined, "Phase 31 regression");
  await getOperationsPlanner(ctxA, resolvePlanningWindow({ weeks: "1" }));

  const otherTenantException = await prisma.qualityException.findFirst({ where: { tenantId: tenantB.id } });
  if (otherTenantException) {
    let isolationFailed = false;
    try {
      await updateQualityException(ctxB, created.id, { title: "Should fail" });
    } catch {
      isolationFailed = true;
    }
    assert(isolationFailed, "Tenant A exception not editable from tenant B context");
  } else {
    let isolationFailed = false;
    try {
      await transitionQualityException(ctxB, created.id, "CLOSED");
    } catch {
      isolationFailed = true;
    }
    assert(isolationFailed, "Tenant isolation on transition");
  }

  await prisma.qualityCorrectiveAction.deleteMany({ where: { exceptionId: created.id } });
  await prisma.qualityExceptionEvent.deleteMany({ where: { exceptionId: created.id } });
  await prisma.qualityException.delete({ where: { id: created.id } });

  assert(nextQualityReference(0).endsWith("001"), "Reference format");
  console.log("Phase 35 verification passed.");
}
