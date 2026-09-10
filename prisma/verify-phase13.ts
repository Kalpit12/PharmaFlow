import { PrismaClient } from "@prisma/client";

import { batchExpiryStatus, inventoryHealth } from "../src/lib/reports/risk";
import { listCommunications } from "../src/lib/server/communications";
import type { TenantContext } from "../src/lib/server/errors";
import { getInventorySnapshot, resolveInventoryFilters } from "../src/lib/server/inventory";
import { getOperationsPlanner, resolvePlanningWindow } from "../src/lib/server/operations";
import { getReportingSnapshot, resolveReportFilters } from "../src/lib/server/reports";
import { proposeAction } from "../src/lib/server/actions";
import { proposeWorkflow } from "../src/lib/server/workflows";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase13Verify(prisma: PrismaClient) {
  assert(inventoryHealth(0, 100) === "OUT_OF_STOCK", "Zero stock is out of stock");
  assert(inventoryHealth(40, 100) === "CRITICAL", "≤50% of safety is critical");
  assert(inventoryHealth(80, 100) === "LOW", "At or below safety is low");
  assert(inventoryHealth(120, 100) === "HEALTHY", "Above safety is healthy");
  assert(batchExpiryStatus(-1) === "EXPIRED", "Negative days remaining is expired");
  assert(batchExpiryStatus(10) === "EXPIRING_SOON", "0–30 days is expiring soon");
  assert(batchExpiryStatus(90) === "HEALTHY", "Dated beyond 30 days is healthy");
  assert(batchExpiryStatus(null) === null, "Undated batches have no expiry status");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const empty = await prisma.tenant.findUnique({ where: { slug: "tenant-c-empty" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && empty && user, "Tenants required");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const other: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };
  const vacant: TenantContext = { tenantId: empty.id, userId: user.id, role: "MANAGER" };

  const overview = await getInventorySnapshot(manager, resolveInventoryFilters({ view: "overview" }));
  const overviewB = await getInventorySnapshot(other, resolveInventoryFilters({ view: "overview" }));
  const emptyInv = await getInventorySnapshot(vacant, resolveInventoryFilters({ view: "overview" }));
  const again = await getInventorySnapshot(manager, resolveInventoryFilters({ view: "overview" }));

  assert(!overview.items.some((item) => item.batches.some((batch) => batch.batchCode === "ISO-LOT-1")), "Tenant isolation");
  assert(overviewB.items.some((item) => item.batches.some((batch) => batch.batchCode === "ISO-LOT-1")), "Isolation tenant sees own batch");
  assert(!overviewB.items.some((item) => item.sku === "AMOX-500-CAP"), "Isolation tenant does not see Lab Allied SKUs");
  assert(emptyInv.items.length === 0, "Empty tenant inventory");
  assert(overview.items.length === again.items.length, "Deterministic inventory totals");
  assert(overview.items.some((item) => item.classId === "FINISHED_GOOD"), "Finished goods");
  assert(overview.items.some((item) => item.classId === "RAW_MATERIAL"), "Raw materials");
  assert(overview.items.some((item) => item.classId === "PACKAGING"), "Packaging");
  assert(overview.expiryBuckets.some((row) => row.id === "expired"), "Expiry buckets");
  assert(overview.ageingBuckets.some((row) => row.quantity > 0), "Ageing buckets");
  assert(overview.items.some((item) => item.inTransit > 0), "Goods in transit from open receipts");

  const present = overview.health.find((row) => row.count > 0 && row.id !== "HEALTHY");
  if (present) {
    const health = await getInventorySnapshot(manager, resolveInventoryFilters({ view: "health", status: present.id }));
    assert(health.items.every((item) => item.health === present.id), "Health status filter");
  }

  const search = await getInventorySnapshot(manager, resolveInventoryFilters({ q: "AMOX" }));
  assert(search.items.every((item) => item.sku.includes("AMOX") || item.name.toLowerCase().includes("amox") || item.batches.some((batch) => batch.batchCode.includes("AMOX"))), "Search is tenant scoped");

  const fg = await getInventorySnapshot(manager, resolveInventoryFilters({ class: "FINISHED_GOOD" }));
  assert(fg.items.every((item) => item.classId === "FINISHED_GOOD"), "Category filter");

  const reports = await getReportingSnapshot(manager, resolveReportFilters({ view: "health" }));
  assert(reports.health.length === 4, "Reports health integration");
  assert(reports.view === "health", "Reports health view");

  const planner = await getOperationsPlanner(manager, resolvePlanningWindow({ weeks: "1" }));
  assert(planner.orders.length > 0, "Phase 12.5 operations still work");

  const action = await proposeAction(manager, {
    type: "CREATE_FOLLOW_UP_TASK",
    title: "Phase13 action still works",
    reason: "Phase 9 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(action?.status === "PENDING_APPROVAL", "Phase 9 actions still work");
  await prisma.action.delete({ where: { id: action.id } });

  const workflow = await proposeWorkflow(manager, {
    type: "CUSTOMER_REENGAGEMENT",
    title: "Phase13 workflow still works",
    reason: "Phase 10 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(workflow?.status === "PENDING_APPROVAL", "Phase 10 workflows still work");
  await prisma.workflow.delete({ where: { id: workflow.id } });

  const comms = await listCommunications(manager);
  assert(Array.isArray(comms.needsReview) && Array.isArray(comms.recent), "Phase 11 communications still work");

  console.log("Phase 13 verification passed.");
}

if (process.argv[1]?.includes("verify-phase13")) {
  const prisma = new PrismaClient();
  runPhase13Verify(prisma)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
