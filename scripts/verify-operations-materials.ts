import assert from "node:assert/strict";

import type { MaterialRequirement } from "../src/lib/materials/types";
import { buildOrderMaterialConstraints } from "../src/lib/operations/material-constraints";
import { buildSchedule, type PlannerOrder } from "../src/lib/operations/schedule";

const now = new Date("2026-10-05T08:00:00.000Z");
const material = {
  productId: "api",
  sku: "API-1",
  name: "Demo API",
  unit: "kg",
  safetyStock: 0,
  grossRequirement: 210,
  onHand: 100,
  available: 100,
  allocated: 210,
  freeAvailable: -110,
  incoming: 100,
  incomingReceipts: [{ quantity: 100, expectedAt: "2026-10-07T12:00:00.000Z" }],
  projectedAvailable: -10,
  netRequirement: 10,
  shortage: true,
  shortagePercent: 4.762,
  shortageStatus: "SHORTAGE",
  earliestShortageDate: "2026-10-07T00:00:00.000Z",
  requirementDate: "2026-10-07T00:00:00.000Z",
  priorityLevel: "CRITICAL",
  priorityReason: "Deterministic verification",
  affectedOrders: [
    {
      id: "critical",
      orderNumber: "MO-CRITICAL",
      productId: "fg-a",
      productName: "Critical product",
      quantity: 80,
      requiredQuantity: 80,
      dueDate: "2026-10-10T16:00:00.000Z",
      priority: "CRITICAL",
      status: "UNSCHEDULED",
      plannedStart: null,
      plannedEnd: null,
    },
    {
      id: "normal",
      orderNumber: "MO-NORMAL",
      productId: "fg-b",
      productName: "Normal product",
      quantity: 70,
      requiredQuantity: 70,
      dueDate: "2026-10-09T16:00:00.000Z",
      priority: "NORMAL",
      status: "UNSCHEDULED",
      plannedStart: null,
      plannedEnd: null,
    },
    {
      id: "blocked",
      orderNumber: "MO-BLOCKED",
      productId: "fg-c",
      productName: "Blocked product",
      quantity: 60,
      requiredQuantity: 60,
      dueDate: "2026-10-11T16:00:00.000Z",
      priority: "LOW",
      status: "UNSCHEDULED",
      plannedStart: null,
      plannedEnd: null,
    },
  ],
  demandSources: [],
  bomPaths: [],
  procurement: {
    openRequisitions: 0,
    openRfqs: 0,
    openPurchaseOrders: 1,
    hrefProcurement: "/procurement",
    hrefRfqs: "/rfqs",
    hrefPurchaseOrders: "/purchase-orders",
  },
  earliestDueDate: "2026-10-09T16:00:00.000Z",
  urgency: "HIGH",
  risk: "CRITICAL",
  status: "SHORTAGE",
  attention: "Procurement attention required",
  lots: [],
  leadTime: "Not available",
  purchasePrice: "Not available",
  reorderPoint: "Not available",
} satisfies MaterialRequirement;

const constraints = buildOrderMaterialConstraints(
  [material],
  ["critical", "normal", "blocked", "unknown"],
  now
);
assert.equal(constraints.get("critical")?.state, "READY", "Critical order receives on-hand first");
assert.equal(constraints.get("normal")?.state, "DELAYED", "Dated receipt delays the next order");
assert.equal(
  constraints.get("normal")?.readyAt?.toISOString(),
  "2026-10-07T12:00:00.000Z"
);
assert.equal(constraints.get("blocked")?.state, "BLOCKED", "Uncovered demand is blocked");
assert.equal(constraints.get("unknown")?.state, "UNKNOWN", "No BOM demand remains explicit");

function plannerOrder(id: string): PlannerOrder {
  const constraint = constraints.get(id)!;
  return {
    id,
    orderNumber: id,
    productName: id,
    workstationId: "line",
    durationMinutes: 60,
    priority: id === "critical" ? "CRITICAL" : id === "blocked" ? "LOW" : "NORMAL",
    dueDate: new Date("2026-10-20T16:00:00.000Z"),
    createdAt: now,
    isLocked: false,
    plannedStart: null,
    plannedEnd: null,
    materialReadyAt: constraint.readyAt,
    materialBlocked: constraint.state === "BLOCKED",
  };
}

const schedule = buildSchedule(
  [plannerOrder("critical"), plannerOrder("normal"), plannerOrder("blocked")],
  [{ id: "line", name: "Line", code: "L1", capacityHoursPerDay: 8 }],
  { start: now, end: new Date("2026-10-12T08:00:00.000Z") }
);
assert.equal(schedule.orders.find((order) => order.id === "critical")?.plannedStart?.toISOString(), now.toISOString());
assert.equal(
  schedule.orders.find((order) => order.id === "normal")?.plannedStart?.toISOString(),
  "2026-10-07T12:00:00.000Z",
  "Schedule waits for dated supply"
);
assert.equal(schedule.orders.find((order) => order.id === "blocked")?.plannedStart, null);
assert.ok(
  schedule.conflicts.some(
    (conflict) => conflict.orderNumber === "blocked" && conflict.kind === "material-unavailable"
  )
);

console.log("Operations material-constraint verification passed.");
