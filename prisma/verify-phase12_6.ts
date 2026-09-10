import { PrismaClient } from "@prisma/client";

import {
  AGEING_BUCKETS,
  EXPIRY_BUCKETS,
  ageingRisk,
  expiryRisk,
  matchBucket,
  materialStatus,
  sharePercent,
} from "../src/lib/reports/risk";
import { listCommunications } from "../src/lib/server/communications";
import type { TenantContext } from "../src/lib/server/errors";
import { getOperationsPlanner, resolvePlanningWindow } from "../src/lib/server/operations";
import { getReportingSnapshot, resolveReportFilters } from "../src/lib/server/reports";
import { proposeAction } from "../src/lib/server/actions";
import { proposeWorkflow } from "../src/lib/server/workflows";
import { ensureReportingDemoData } from "./seed-reports";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase12_6Verify(prisma: PrismaClient) {
  assert(expiryRisk(-1) === "CRITICAL", "Expired inventory is critical");
  assert(expiryRisk(10) === "HIGH", "0–30 day expiry is high");
  assert(expiryRisk(60) === "MEDIUM", "≤90 day expiry is medium");
  assert(ageingRisk(400) === "CRITICAL", "360+ ageing is critical");
  assert(materialStatus(10, 100) === "SHORT", "Stock far below safety is short");
  assert(materialStatus(80, 100) === "BELOW_SAFETY", "Stock below safety stock");
  assert(materialStatus(500, 100) === "EXCESS", "Excess stock");
  assert(matchBucket(-5, EXPIRY_BUCKETS).id === "expired", "Expiry bucket for overdue lots");
  assert(matchBucket(400, AGEING_BUCKETS).id === "360+", "Ageing 360+ bucket");
  assert(sharePercent(25, 100) === 25, "Share percent");
  assert(sharePercent(1, 0) === 0, "Zero total share");

  await ensureReportingDemoData(prisma);
  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const empty = await prisma.tenant.findUnique({ where: { slug: "tenant-c-empty" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && empty && user, "Tenants required");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const other: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };
  const vacant: TenantContext = { tenantId: empty.id, userId: user.id, role: "MANAGER" };

  const overview = await getReportingSnapshot(manager, resolveReportFilters({ view: "overview" }));
  const overviewB = await getReportingSnapshot(other, resolveReportFilters({ view: "overview" }));
  const emptyReport = await getReportingSnapshot(vacant, resolveReportFilters({ view: "overview" }));

  assert(!overview.lots.some((lot) => lot.batchCode === "ISO-LOT-1"), "Tenant isolation");
  assert(!overviewB.lots.some((lot) => lot.batchCode === "FG-AMOX-EXP"), "Isolation tenant does not see Lab Allied lots");
  assert(overviewB.lots.some((lot) => lot.batchCode === "ISO-LOT-1"), "Isolation tenant sees its own lot");
  assert(emptyReport.lots.length === 0, "Empty dataset");
  assert(emptyReport.kpis.every((kpi) => kpi.value === "0" || kpi.value.startsWith("KSh 0") || kpi.value === "—"), "Zero values for empty tenant");
  assert(emptyReport.findings[0] === "Nothing requires immediate attention.", "Empty findings");
  assert(overview.history.length >= 2, "Demo snapshots exist");
  assert(overview.historyNote !== "Historical trend unavailable", "History uses stored snapshots");
  assert(emptyReport.historyNote === "Historical trend unavailable", "Empty tenant has no snapshots");
  assert(overview.suppliers.length > 0, "Demo suppliers");
  assert(overviewB.suppliers.length === 0, "Isolation tenant has no Lab Allied suppliers");
  assert(overview.production.statuses.some((row) => row.id === "AT_RISK"), "Production status distribution");
  assert(overview.expiryBuckets.some((row) => row.id === "expired" && row.quantity > 0), "Expiry buckets");
  assert(overview.ageingBuckets.some((row) => row.quantity > 0), "Ageing buckets");
  assert(overview.kpis.find((row) => row.id === "expired")?.risk === "CRITICAL", "Expired KPI risk");

  const sameA = await getReportingSnapshot(manager, resolveReportFilters({ view: "inventory" }));
  const sameB = await getReportingSnapshot(manager, resolveReportFilters({ view: "inventory" }));
  assert(sameA.lots.length === sameB.lots.length, "Deterministic inventory totals");

  const production = await getReportingSnapshot(manager, resolveReportFilters({ view: "production" }));
  const planner = await getOperationsPlanner(manager, resolvePlanningWindow({ weeks: "1" }));
  assert(production.production.scheduled === planner.orders.filter((row) => row.displayStatus !== "UNSCHEDULED").length, "Production report reuses planner");

  const materials = await getReportingSnapshot(manager, resolveReportFilters({ view: "materials" }));
  assert(materials.materials.length > 0, "Material reporting");
  assert(materials.materials.some((row) => row.hasBom), "BOM requirements");
  assert(materials.materials.some((row) => row.incoming > 0), "Open inbound receipts");

  const finished = await getReportingSnapshot(manager, resolveReportFilters({ view: "finished-goods" }));
  assert(finished.lots.every((lot) => lot.classId === "FINISHED_GOOD"), "Finished goods view is class-scoped");
  assert(finished.concentration, "Class concentration");

  const action = await proposeAction(manager, {
    type: "CREATE_FOLLOW_UP_TASK",
    title: "Phase12.6 action still works",
    reason: "Phase 9 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(action?.status === "PENDING_APPROVAL", "Phase 9 actions still work");
  await prisma.action.delete({ where: { id: action.id } });

  const workflow = await proposeWorkflow(manager, {
    type: "CUSTOMER_REENGAGEMENT",
    title: "Phase12.6 workflow still works",
    reason: "Phase 10 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(workflow?.status === "PENDING_APPROVAL", "Phase 10 workflows still work");
  await prisma.workflow.delete({ where: { id: workflow.id } });

  const comms = await listCommunications(manager);
  assert(Array.isArray(comms.needsReview) && Array.isArray(comms.recent), "Phase 11 communications still work");
  assert(planner.orders.length > 0, "Phase 12.5 operations still work");

  console.log("Phase 12.6 verification passed.");
}

if (process.argv[1]?.includes("verify-phase12_6")) {
  const prisma = new PrismaClient();
  runPhase12_6Verify(prisma)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
