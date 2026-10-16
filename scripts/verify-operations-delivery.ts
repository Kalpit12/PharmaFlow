import assert from "node:assert/strict";

import { buildOperationSchedule, type RoutingOrder } from "../src/lib/operations/routing";

/** Monday 08:00 plant (EAT). */
const start = new Date("2026-10-05T05:00:00.000Z");
const occupancy: RoutingOrder = {
  id: "LIVE",
  orderNumber: "LIVE",
  priority: "HIGH",
  dueDate: new Date("2026-10-08T16:00:00.000Z"),
  createdAt: start,
  operations: [
    {
      id: "live-mix",
      orderId: "LIVE",
      orderNumber: "LIVE",
      sequence: 10,
      durationMinutes: 240,
      setupMinutes: 0,
      teardownMinutes: 0,
      changeoverFamily: "GENERAL",
      resources: [{ workstationId: "line-a", efficiencyPercent: 100, preferred: true }],
      locked: true,
      workstationId: "line-a",
      plannedStart: start,
      plannedEnd: new Date("2026-10-05T09:00:00.000Z"),
    },
  ],
};

const enquiry: RoutingOrder = {
  id: "SIM",
  orderNumber: "SIM",
  priority: "NORMAL",
  dueDate: new Date("2026-10-05T16:00:00.000Z"),
  createdAt: start,
  operations: [
    {
      id: "sim-mix",
      orderId: "SIM",
      orderNumber: "SIM",
      sequence: 10,
      durationMinutes: 120,
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

const result = buildOperationSchedule({
  orders: [occupancy, enquiry],
  dependencies: [],
  workstations: [{ id: "line-a", code: "LA", capacityHoursPerDay: 8 }],
  changeovers: [],
  windowStart: start,
});
const simulated = result.operations.find((row) => row.id === "sim-mix")!;
assert.equal(simulated.plannedStart?.toISOString(), "2026-10-05T09:00:00.000Z");
assert.equal(simulated.plannedEnd?.toISOString(), "2026-10-05T11:00:00.000Z");
assert.ok(simulated.plannedEnd && simulated.plannedEnd.getTime() < enquiry.dueDate.getTime());

console.log("Operations delivery-simulation verification passed.");
