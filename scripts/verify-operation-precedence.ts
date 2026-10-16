import assert from "node:assert/strict";

import { buildOperationSchedule, sequenceDependenciesForOrder, type RoutingOrder } from "../src/lib/operations/routing";

const start = new Date("2026-10-16T05:00:00.000Z");

const order: RoutingOrder = {
  id: "O1",
  orderNumber: "ORD010-2026/F",
  priority: "NORMAL",
  dueDate: new Date("2026-11-01T12:00:00.000Z"),
  createdAt: start,
  operations: [
    {
      id: "op-blnd",
      orderId: "O1",
      orderNumber: "ORD010-2026/F",
      sequence: 10,
      durationMinutes: 360,
      setupMinutes: 30,
      teardownMinutes: 0,
      changeoverFamily: "GENERAL",
      resources: [{ workstationId: "ws-blnd", efficiencyPercent: 100, preferred: true }],
      locked: false,
      workstationId: null,
      plannedStart: null,
      plannedEnd: null,
    },
    {
      id: "op-comp",
      orderId: "O1",
      orderNumber: "ORD010-2026/F",
      sequence: 20,
      durationMinutes: 720,
      setupMinutes: 30,
      teardownMinutes: 0,
      changeoverFamily: "GENERAL",
      resources: [{ workstationId: "ws-comp", efficiencyPercent: 100, preferred: true }],
      locked: false,
      workstationId: null,
      plannedStart: null,
      plannedEnd: null,
    },
    {
      id: "op-pack",
      orderId: "O1",
      orderNumber: "ORD010-2026/F",
      sequence: 50,
      durationMinutes: 900,
      setupMinutes: 30,
      teardownMinutes: 0,
      changeoverFamily: "GENERAL",
      resources: [{ workstationId: "ws-pack", efficiencyPercent: 100, preferred: true }],
      locked: false,
      workstationId: null,
      plannedStart: null,
      plannedEnd: null,
    },
  ],
};

assert.equal(sequenceDependenciesForOrder(order.operations).length, 2);

const scheduled = buildOperationSchedule({
  orders: [order],
  dependencies: [],
  workstations: [
    { id: "ws-blnd", code: "BLND", capacityHoursPerDay: 18 },
    { id: "ws-comp", code: "COMP", capacityHoursPerDay: 18 },
    { id: "ws-pack", code: "PACK", capacityHoursPerDay: 18 },
  ],
  changeovers: [],
  windowStart: start,
});

const byId = new Map(scheduled.operations.map((row) => [row.id, row]));
const blnd = byId.get("op-blnd")!;
const comp = byId.get("op-comp")!;
const pack = byId.get("op-pack")!;

assert.ok(blnd.plannedStart && blnd.plannedEnd);
assert.ok(comp.plannedStart && comp.plannedEnd);
assert.ok(pack.plannedStart && pack.plannedEnd);
assert.ok(comp.plannedStart!.getTime() >= blnd.plannedEnd!.getTime(), "compression starts after blending");
assert.ok(pack.plannedStart!.getTime() >= comp.plannedEnd!.getTime(), "packing starts after compression");

console.log("verify-operation-precedence: implicit sequence OK");
