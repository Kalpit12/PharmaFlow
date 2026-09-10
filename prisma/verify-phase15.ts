import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  buildProcurementRecommendations,
  isProcurementRecommendation,
  PROCUREMENT_RECOMMENDATION_RISKS,
  suggestedProcurementQuantity,
} from "../src/lib/procurement/recommendations";
import { canApprove } from "../src/lib/server/actions";
import { listCommunications } from "../src/lib/server/communications";
import type { TenantContext } from "../src/lib/server/errors";
import { getInventorySnapshot, resolveInventoryFilters } from "../src/lib/server/inventory";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "../src/lib/server/materials";
import { getOperationsPlanner, resolvePlanningWindow } from "../src/lib/server/operations";
import {
  createRequisitionDraft,
  getProcurementSnapshot,
  resolveProcurementFilters,
  reviewRequisition,
} from "../src/lib/server/procurement";
import { getReportingSnapshot, resolveReportFilters } from "../src/lib/server/reports";
import { proposeAction } from "../src/lib/server/actions";
import { proposeWorkflow } from "../src/lib/server/workflows";
import { ServerError } from "../src/lib/server/errors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase15Verify(prisma: PrismaClient) {
  const engineSource = readFileSync(join(process.cwd(), "src/lib/procurement/recommendations.ts"), "utf8");
  const serverSource = readFileSync(join(process.cwd(), "src/lib/server/procurement.ts"), "utf8");
  const pageSource = readFileSync(join(process.cwd(), "src/app/(workspace)/procurement/page.tsx"), "utf8");
  assert(!/openai/i.test(engineSource + serverSource + pageSource), "Phase 15 performs ZERO OpenAI calls");
  assert(!engineSource.includes("fetch("), "Procurement engine is deterministic in-memory");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const empty = await prisma.tenant.findUnique({ where: { slug: "tenant-c-empty" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && empty && user, "Tenants required");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const viewer: TenantContext = { tenantId: tenant.id, userId: user.id, role: "VIEWER" };
  const other: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };
  const vacant: TenantContext = { tenantId: empty.id, userId: user.id, role: "MANAGER" };

  const materials = await getMaterialsSnapshot(manager, resolveMaterialsFilters({ view: "requirements" }));
  const recommendations = buildProcurementRecommendations(materials.materials, new Map());
  assert(recommendations.every((row) => row.risk !== "OK"), "No recommendation for OK materials");
  assert(
    recommendations.every((row) => PROCUREMENT_RECOMMENDATION_RISKS.includes(row.risk) || row.rowStatus === "MONITOR"),
    "Recommendations limited to CRITICAL/HIGH/MEDIUM or MONITOR for LOW"
  );
  assert(
    recommendations.filter((row) => row.rowStatus === "MONITOR").every((row) => row.risk === "LOW"),
    "LOW materials display as Monitor without auto draft"
  );

  for (const row of recommendations.filter((row) => isProcurementRecommendation(materials.materials.find((m) => m.productId === row.productId)!))) {
    const material = materials.materials.find((m) => m.productId === row.productId)!;
    assert(row.suggestedQuantity === suggestedProcurementQuantity(material), "Suggested quantity equals net requirement");
    assert(row.suggestedQuantity === material.netRequirement, "Suggested qty matches Phase 14 net requirement");
  }

  const ordersBefore = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  const lotsBefore = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });

  const target = materials.materials.find((row) => isProcurementRecommendation(row));
  const createdIds: string[] = [];
  const usedProductIds = new Set<string>();

  if (target) {
    const draft = await createRequisitionDraft(manager, target.productId);
    createdIds.push(draft.id);
    usedProductIds.add(target.productId);
    assert(draft.status === "DRAFT", "Requisition draft creation");
    assert(draft.quantity === target.netRequirement, "Draft quantity matches net requirement");
    assert(draft.reason.length > 0, "Draft includes deterministic reason");

    const duplicate = await createRequisitionDraft(manager, target.productId);
    assert(duplicate.id === draft.id, "Duplicate draft prevention for same material");

    const reviewed = await reviewRequisition(manager, draft.id, "review");
    assert(reviewed.status === "REVIEWED", "DRAFT → REVIEWED");
    createdIds.push(reviewed.id);

    let rejectedBlocked = false;
    try {
      await reviewRequisition(manager, reviewed.id, "reject");
    } catch (error) {
      rejectedBlocked = error instanceof ServerError && error.code === "FORBIDDEN";
    }
    assert(rejectedBlocked, "Reviewed requisition cannot become rejected");

    const secondTarget = materials.materials.find((row) => isProcurementRecommendation(row) && row.productId !== target.productId);
    if (secondTarget) {
      const rejectDraft = await createRequisitionDraft(manager, secondTarget.productId);
      createdIds.push(rejectDraft.id);
      usedProductIds.add(secondTarget.productId);
      const rejected = await reviewRequisition(manager, rejectDraft.id, "reject");
      assert(rejected.status === "REJECTED", "DRAFT → REJECTED");
      let reviewBlocked = false;
      try {
        await reviewRequisition(manager, rejected.id, "review");
      } catch (error) {
        reviewBlocked = error instanceof ServerError && error.code === "FORBIDDEN";
      }
      assert(reviewBlocked, "Rejected requisition cannot become reviewed");
    }
  }

  if (target) {
    let viewerBlocked = false;
    const fresh = materials.materials.find((row) => isProcurementRecommendation(row) && !usedProductIds.has(row.productId));
    if (fresh) {
      const viewerDraft = await createRequisitionDraft(viewer, fresh.productId);
      createdIds.push(viewerDraft.id);
      try {
        await reviewRequisition(viewer, viewerDraft.id, "review");
      } catch (error) {
        viewerBlocked = error instanceof ServerError && error.code === "FORBIDDEN";
      }
      assert(viewerBlocked && !canApprove(viewer.role), "Unauthorized role cannot review");
    }
  }

  const snapshot = await getProcurementSnapshot(manager, resolveProcurementFilters({ view: "all" }));
  assert(snapshot.planningNote.toLowerCase().includes("no purchase order"), "UI makes non-execution clear");

  const isolation = await getProcurementSnapshot(other, resolveProcurementFilters({ view: "all" }));
  const vacantSnap = await getProcurementSnapshot(vacant, resolveProcurementFilters({ view: "all" }));
  assert(vacantSnap.rows.length === 0 || vacantSnap.emptyReason !== null, "Empty tenant handled");

  if (target && createdIds.length > 0) {
    const cross = await prisma.procurementRequisition.findFirst({ where: { id: createdIds[0], tenantId: tenantB.id } });
    assert(!cross, "Tenant isolation for requisitions");
  }

  assert(isolation.rows.every((row) => !row.sku.toLowerCase().includes("amoxicillin")), "Tenant B procurement isolated from tenant A SKUs");

  const ordersAfter = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  const lotsAfter = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  assert(ordersAfter === ordersBefore, "Production orders are not modified");
  assert(lotsAfter === lotsBefore, "Inventory is not modified");

  const reports = await getReportingSnapshot(manager, resolveReportFilters({ view: "materials" }));
  assert(reports.materialPlan.procurementAttention >= 0, "Reports procurement integration");

  const planner = await getOperationsPlanner(manager, resolvePlanningWindow({ weeks: "1" }));
  assert(planner.orders.length > 0, "Phase 12.5 operations still work");

  const inventory = await getInventorySnapshot(manager, resolveInventoryFilters({ view: "overview" }));
  assert(inventory.items.length > 0, "Phase 13 inventory still works");

  const phase14 = await getMaterialsSnapshot(manager, resolveMaterialsFilters({ view: "requirements" }));
  assert(phase14.materials.length === materials.materials.length, "Phase 14 materials still works");

  const action = await proposeAction(manager, {
    type: "CREATE_FOLLOW_UP_TASK",
    title: "Phase15 action still works",
    reason: "Phase 9 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(action?.status === "PENDING_APPROVAL", "Phase 9 actions still work");
  await prisma.action.delete({ where: { id: action.id } });

  const workflow = await proposeWorkflow(manager, {
    type: "CUSTOMER_REENGAGEMENT",
    title: "Phase15 workflow still works",
    reason: "Phase 10 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(workflow?.status === "PENDING_APPROVAL", "Phase 10 workflows still work");
  await prisma.workflow.delete({ where: { id: workflow.id } });

  const comms = await listCommunications(manager);
  assert(Array.isArray(comms.needsReview) && Array.isArray(comms.recent), "Phase 11 communications still work");

  if (createdIds.length > 0) {
    await prisma.procurementRequisition.deleteMany({ where: { id: { in: createdIds }, tenantId: tenant.id } });
  }

  console.log("Phase 15 verification passed.");
}

if (process.argv[1]?.includes("verify-phase15")) {
  const prisma = new PrismaClient();
  runPhase15Verify(prisma)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
