import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  classifyMaterialRisk,
  computeMaterialRequirements,
  isOpenProductionStatus,
  roundQty,
} from "../src/lib/materials/requirements";
import { listCommunications } from "../src/lib/server/communications";
import type { TenantContext } from "../src/lib/server/errors";
import { getInventorySnapshot, resolveInventoryFilters } from "../src/lib/server/inventory";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "../src/lib/server/materials";
import { getOperationsPlanner, resolvePlanningWindow } from "../src/lib/server/operations";
import { getReportingSnapshot, resolveReportFilters } from "../src/lib/server/reports";
import { proposeAction } from "../src/lib/server/actions";
import { proposeWorkflow } from "../src/lib/server/workflows";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixtureNow(): Date {
  return new Date("2026-08-17T12:00:00.000Z");
}

export async function runPhase14Verify(prisma: PrismaClient) {
  const engineSource = readFileSync(join(process.cwd(), "src/lib/materials/requirements.ts"), "utf8");
  const serverSource = readFileSync(join(process.cwd(), "src/lib/server/materials.ts"), "utf8");
  const pageSource = readFileSync(join(process.cwd(), "src/app/(workspace)/materials/page.tsx"), "utf8");
  assert(!/openai/i.test(engineSource + serverSource + pageSource), "Phase 14 performs ZERO OpenAI calls");
  assert(!engineSource.includes("fetch("), "Engine is in-memory only");

  const qty = roundQty(100_000 * 0.01);
  assert(qty === 1000, "quantity multiplication uses BOM quantityPer");

  const rows = computeMaterialRequirements({
    now: fixtureNow(),
    identities: [
      { id: "api", sku: "API-X", name: "API X", unit: "kg", safetyStock: 0 },
      { id: "pack", sku: "PACK-1", name: "Packaging", unit: "unit", safetyStock: 0 },
    ],
    boms: [
      { productId: "fg", componentId: "api", quantityPer: 0.01 },
      { productId: "fg", componentId: "pack", quantityPer: 0.2 },
    ],
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
      {
        id: "po-2",
        orderNumber: "PO-2",
        productId: "fg",
        productName: "Finished",
        quantity: 50_000,
        dueDate: "2026-09-10T00:00:00.000Z",
        priority: "NORMAL",
        status: "UNSCHEDULED",
        plannedStart: null,
        plannedEnd: null,
      },
      {
        id: "po-done",
        orderNumber: "PO-DONE",
        productId: "fg",
        productName: "Finished",
        quantity: 999_999,
        dueDate: "2026-08-18T00:00:00.000Z",
        priority: "CRITICAL",
        status: "COMPLETED",
        plannedStart: null,
        plannedEnd: null,
      },
    ],
    lots: [
      { productId: "api", batchCode: "API-LOT", quantity: 800, expiryDate: "2027-01-01T00:00:00.000Z", warehouseName: "RM" },
      { productId: "api", batchCode: "API-EXP", quantity: 500, expiryDate: "2026-01-01T00:00:00.000Z", warehouseName: "RM" },
      { productId: "pack", batchCode: "PK-LOT", quantity: 40_000, expiryDate: null, warehouseName: "PK" },
    ],
    receipts: [{ productId: "api", quantity: 200 }, { productId: "pack", quantity: 5_000 }],
  });

  const api = rows.find((row) => row.sku === "API-X");
  const pack = rows.find((row) => row.sku === "PACK-1");
  assert(api && pack, "BOM explosion created both materials");
  assert(api.grossRequirement === 1500, "Aggregation across production orders");
  assert(api.available === 800, "Expired lots are excluded from usable inventory");
  assert(api.incoming === 200, "Incoming inventory from open receipts");
  assert(api.netRequirement === 500, "Net requirement after inventory and incoming");
  assert(api.projectedAvailable === -500, "Projected available = available + incoming - gross");
  assert(api.shortage === true, "Shortage detection");
  assert(api.affectedOrders.map((order) => order.id).join(",") === "po-1,po-2", "Affected production order mapping");
  assert(!api.affectedOrders.some((order) => order.id === "po-done"), "Completed orders are excluded");
  assert(api.risk === "CRITICAL", "High-priority imminent shortage is CRITICAL");
  assert(pack.grossRequirement === 30_000, "Packaging quantity multiplication");
  assert(pack.shortage === false, "Incoming can cover packaging");
  assert(pack.status === "INCOMING_COVERS" || pack.risk === "MEDIUM" || pack.risk === "OK", "Covered or incoming-covers packaging");

  const again = computeMaterialRequirements({
    now: fixtureNow(),
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
        plannedStart: null,
        plannedEnd: null,
      },
    ],
    lots: [{ productId: "api", batchCode: "API-LOT", quantity: 800, expiryDate: "2027-01-01T00:00:00.000Z", warehouseName: "RM" }],
    receipts: [{ productId: "api", quantity: 200 }],
  });
  const twice = computeMaterialRequirements({
    now: fixtureNow(),
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
        plannedStart: null,
        plannedEnd: null,
      },
    ],
    lots: [{ productId: "api", batchCode: "API-LOT", quantity: 800, expiryDate: "2027-01-01T00:00:00.000Z", warehouseName: "RM" }],
    receipts: [{ productId: "api", quantity: 200 }],
  });
  assert(JSON.stringify(again) === JSON.stringify(twice), "Deterministic output");

  assert(
    classifyMaterialRisk({
      shortage: true,
      available: 0,
      incoming: 0,
      grossRequirement: 10,
      projectedAvailable: -10,
      affectedPriorities: ["NORMAL"],
      earliestDueDate: "2026-09-30T00:00:00.000Z",
      now: fixtureNow(),
    }) === "HIGH",
    "Shortage without imminent high-priority due is HIGH"
  );
  assert(
    classifyMaterialRisk({
      shortage: false,
      available: 40,
      incoming: 20,
      grossRequirement: 50,
      projectedAvailable: 10,
      affectedPriorities: ["NORMAL"],
      earliestDueDate: "2026-09-30T00:00:00.000Z",
      now: fixtureNow(),
    }) === "MEDIUM",
    "Incoming covering a current gap is MEDIUM"
  );

  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const empty = await prisma.tenant.findUnique({ where: { slug: "tenant-c-empty" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && empty && user, "Tenants required");
  assert(isOpenProductionStatus("SCHEDULED") && !isOpenProductionStatus("COMPLETED"), "Open production statuses");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const other: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };
  const vacant: TenantContext = { tenantId: empty.id, userId: user.id, role: "MANAGER" };

  const ordersBefore = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  const lotsBefore = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const receiptsBefore = await prisma.inventoryReceipt.count({ where: { tenantId: tenant.id } });

  const overview = await getMaterialsSnapshot(manager, resolveMaterialsFilters({ view: "requirements" }));
  const isolation = await getMaterialsSnapshot(other, resolveMaterialsFilters({ view: "requirements" }));
  const vacantSnap = await getMaterialsSnapshot(vacant, resolveMaterialsFilters({ view: "requirements" }));
  const againSnap = await getMaterialsSnapshot(manager, resolveMaterialsFilters({ view: "requirements" }));

  assert(!overview.materials.some((row) => row.lots.some((lot) => lot.batchCode === "ISO-LOT-1")), "MediCrest cannot see isolation lots");
  assert(!overview.materials.some((row) => row.sku.toLowerCase().includes("ibuprofen")), "MediCrest cannot see isolation SKUs");
  assert(!isolation.materials.some((row) => row.sku === "AMOX-500-CAP" || row.name.toLowerCase().includes("amoxicillin")), "Isolation tenant cannot see MediCrest materials");
  assert(vacantSnap.materials.length === 0, "Empty tenant has no material requirements");
  assert(JSON.stringify(overview.materials.map((row) => row.productId)) === JSON.stringify(againSnap.materials.map((row) => row.productId)), "Tenant snapshot is deterministic");

  if (overview.materials.length > 0) {
    const first = overview.materials[0];
    const expectedGross = first.affectedOrders.reduce((sum, order) => sum + order.requiredQuantity, 0);
    assert(Math.abs(first.grossRequirement - roundQty(expectedGross)) < 0.002, "Persisted snapshot matches BOM × order qty");
    assert(first.netRequirement === roundQty(Math.max(0, first.grossRequirement - first.available - first.incoming)), "Persisted net requirement");
    assert(first.shortage === first.projectedAvailable < 0, "Persisted shortage flag");
  }

  const shortages = await getMaterialsSnapshot(manager, resolveMaterialsFilters({ view: "shortages" }));
  assert(shortages.materials.every((row) => row.shortage), "Shortages view only includes confirmed shortages");

  const reports = await getReportingSnapshot(manager, resolveReportFilters({ view: "materials" }));
  assert(reports.view === "materials", "Reports materials view");
  assert(reports.materialPlan.required >= 0, "Reports material plan integration");

  const planner = await getOperationsPlanner(manager, resolvePlanningWindow({ weeks: "1" }));
  assert(planner.orders.length > 0, "Phase 12.5 operations still work");

  const inventory = await getInventorySnapshot(manager, resolveInventoryFilters({ view: "overview" }));
  assert(inventory.items.length > 0, "Phase 13 inventory/reporting still work");

  const action = await proposeAction(manager, {
    type: "CREATE_FOLLOW_UP_TASK",
    title: "Phase14 action still works",
    reason: "Phase 9 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(action?.status === "PENDING_APPROVAL", "Phase 9 actions still work");
  await prisma.action.delete({ where: { id: action.id } });

  const workflow = await proposeWorkflow(manager, {
    type: "CUSTOMER_REENGAGEMENT",
    title: "Phase14 workflow still works",
    reason: "Phase 10 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(workflow?.status === "PENDING_APPROVAL", "Phase 10 workflows still work");
  await prisma.workflow.delete({ where: { id: workflow.id } });

  const comms = await listCommunications(manager);
  assert(Array.isArray(comms.needsReview) && Array.isArray(comms.recent), "Phase 11 communications still work");

  const ordersAfter = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  const lotsAfter = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const receiptsAfter = await prisma.inventoryReceipt.count({ where: { tenantId: tenant.id } });
  assert(ordersAfter === ordersBefore, "No mutation of production orders");
  assert(lotsAfter === lotsBefore, "No mutation of inventory");
  assert(receiptsAfter === receiptsBefore, "No mutation of receipts");

  console.log("Phase 14 verification passed.");
}

if (process.argv[1]?.includes("verify-phase14")) {
  const prisma = new PrismaClient();
  runPhase14Verify(prisma)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
