import assert from "node:assert/strict";

import { buildProposedOrderChanges, summarizeProposal } from "../src/lib/operations/proposal";
import { buildOperationSchedule, type RoutingOrder } from "../src/lib/operations/routing";

const start = new Date("2026-10-05T08:00:00.000Z");
const freezeUntil = new Date("2026-10-06T08:00:00.000Z");

const locked: RoutingOrder = {
  id: "MO-LOCK",
  orderNumber: "MO-LOCK",
  priority: "HIGH",
  dueDate: new Date("2026-10-08T16:00:00.000Z"),
  createdAt: start,
  operations: [
    {
      id: "lock-mix",
      orderId: "MO-LOCK",
      orderNumber: "MO-LOCK",
      sequence: 10,
      durationMinutes: 120,
      setupMinutes: 0,
      teardownMinutes: 0,
      changeoverFamily: "GENERAL",
      resources: [{ workstationId: "line-a", efficiencyPercent: 100, preferred: true }],
      locked: false,
      workstationId: "line-a",
      plannedStart: new Date("2026-10-05T08:00:00.000Z"),
      plannedEnd: new Date("2026-10-05T10:00:00.000Z"),
    },
  ],
};

const movable: RoutingOrder = {
  id: "MO-MOVE",
  orderNumber: "MO-MOVE",
  priority: "NORMAL",
  dueDate: new Date("2026-10-07T16:00:00.000Z"),
  createdAt: start,
  operations: [
    {
      id: "move-mix",
      orderId: "MO-MOVE",
      orderNumber: "MO-MOVE",
      sequence: 10,
      durationMinutes: 60,
      setupMinutes: 0,
      teardownMinutes: 0,
      changeoverFamily: "GENERAL",
      resources: [{ workstationId: "line-a", efficiencyPercent: 100, preferred: true }],
      locked: false,
      workstationId: null,
      plannedStart: null,
      plannedEnd: null,
    },
  ],
};

const schedule = buildOperationSchedule({
  orders: [locked, movable],
  dependencies: [],
  workstations: [{ id: "line-a", code: "LA", capacityHoursPerDay: 8 }],
  changeovers: [],
  windowStart: start,
  freezeUntil,
});

const frozenOp = schedule.operations.find((row) => row.id === "lock-mix")!;
const movedOp = schedule.operations.find((row) => row.id === "move-mix")!;
assert.equal(frozenOp.plannedStart?.toISOString(), "2026-10-05T08:00:00.000Z");
assert.equal(movedOp.plannedStart?.toISOString(), "2026-10-05T10:00:00.000Z", "Unlocked work waits for the freeze horizon");

const changes = buildProposedOrderChanges({
  orders: [
    {
      id: locked.id,
      orderNumber: locked.orderNumber,
      dueDate: locked.dueDate,
      previousStart: locked.operations[0].plannedStart,
      previousEnd: locked.operations[0].plannedEnd,
      previousWorkstationId: "line-a",
      materialState: "READY",
      isLocked: false,
    },
    {
      id: movable.id,
      orderNumber: movable.orderNumber,
      dueDate: movable.dueDate,
      previousStart: null,
      previousEnd: null,
      previousWorkstationId: "line-a",
      materialState: "READY",
      isLocked: false,
    },
  ],
  operations: schedule.operations,
  freezeUntil,
});
const summary = summarizeProposal({ orders: changes, operations: schedule.operations, freezeUntil });
assert.equal(summary.movedOrders, 1);
assert.equal(summary.lockedOrders, 1);
assert.match(summary.text, /1 unlocked order would move/);

console.log("Operations proposal verification passed.");
