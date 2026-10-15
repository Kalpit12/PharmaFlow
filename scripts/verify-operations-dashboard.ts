import assert from "node:assert/strict";

import {
  buildDailyCapacityLoad,
  computeOtif,
  computeOeeProxy,
  pickBottleneckWorkstation,
} from "../src/lib/operations/planner-dashboard-metrics";

const anchor = new Date("2026-10-15T00:00:00.000Z");
const daily = buildDailyCapacityLoad({
  anchor,
  horizonDays: 2,
  workstations: [
    { id: "w1", code: "CMP-1", name: "Compression 1", capacityHoursPerDay: 8, utilization: 50 },
  ],
  operations: [
    {
      workstationId: "w1",
      plannedStart: "2026-10-15T08:00:00.000Z",
      plannedEnd: "2026-10-15T12:00:00.000Z",
      changeoverMinutes: 0,
    },
  ],
});
assert.equal(daily.length, 2);
assert.ok(daily[0]!.value > 0);

const otif = computeOtif([
  {
    dueDate: new Date("2026-10-20T00:00:00.000Z"),
    actualCompletion: new Date("2026-10-18T00:00:00.000Z"),
    status: "COMPLETED",
  },
  {
    dueDate: new Date("2026-10-20T00:00:00.000Z"),
    actualCompletion: new Date("2026-10-22T00:00:00.000Z"),
    status: "COMPLETED",
  },
]);
assert.equal(otif.otifPercent, 50);
assert.equal(otif.onTimeCount, 1);

const bottleneck = pickBottleneckWorkstation([
  { id: "a", code: "A", name: "A", capacityHoursPerDay: 8, utilization: 40 },
  { id: "b", code: "B", name: "B", capacityHoursPerDay: 8, utilization: 92 },
]);
assert.equal(bottleneck?.code, "B");

const oee = computeOeeProxy({
  plannedMinutes: 100,
  actualMinutes: 110,
  downtimeEvents: 1,
  scrapQuantity: 5,
  goodQuantity: 95,
});
assert.ok(oee.oeePercent > 0 && oee.oeePercent <= 100);

console.log("verify-operations-dashboard: OK");
