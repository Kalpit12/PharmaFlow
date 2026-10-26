import assert from "node:assert/strict";

import {
  buildDailyCapacityLoad,
  computeOtif,
  computeOeeProxy,
  pickBottleneckWorkstation,
} from "../src/lib/operations/planner-dashboard-metrics";

const sunday = new Date("2026-10-25T00:00:00.000Z");
const monday = new Date("2026-10-26T00:00:00.000Z");
const daily = buildDailyCapacityLoad({
  from: sunday,
  to: new Date("2026-10-28T00:00:00.000Z"),
  workstations: [
    { id: "w1", code: "CMP-1", name: "Compression 1", capacityHoursPerDay: 21.5, utilization: 50 },
    { id: "q1", code: "SFG-QUAR", name: "sFG quarantine", capacityHoursPerDay: 24, utilization: 10 },
  ],
  operations: [
    {
      workstationId: "w1",
      workstationCode: "CMP-1",
      plannedStart: "2026-10-26T08:00:00.000Z",
      plannedEnd: "2026-10-26T12:00:00.000Z",
      changeoverMinutes: 0,
    },
    {
      workstationId: "q1",
      workstationCode: "SFG-QUAR",
      plannedStart: "2026-10-25T00:00:00.000Z",
      plannedEnd: "2026-10-25T12:00:00.000Z",
      changeoverMinutes: 0,
      isElapsed: true,
    },
  ],
});
assert.equal(daily.production.length, 3);
assert.equal(daily.production[0]!.value, 0, "Sunday production load is 0");
assert.ok(daily.qcQueue[0]!.value > 0, "Sunday QC queue still shows elapsed hours");
assert.ok(daily.production[1]!.value > 0, "Monday has production load");
void monday;

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
  { id: "q", code: "SFG-QUAR", name: "Quarantine", capacityHoursPerDay: 24, utilization: 99 },
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
