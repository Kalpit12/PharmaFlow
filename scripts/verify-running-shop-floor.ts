import assert from "node:assert/strict";

import { resolveCurrentShopFloorOperation, shopFloorStepLabel } from "../src/lib/operations/current-shop-floor-operation";
import { countRunningOpsByWorkstation, runningBarWindow } from "../src/lib/operations/gantt-running-window";
import { routingStepDisplayName } from "../src/lib/operations/routing-step-labels";
import { computeScheduleAdherence } from "../src/lib/operations/schedule-adherence";
import { listDeliveryLateOrderIds } from "../src/lib/operations/schedule-issue-format";

const ops = [
  { id: "blnd", operationCode: "BLND", status: "COMPLETED", sequence: 10, workstationId: "blend" },
  { id: "pack", operationCode: "PACK", status: "SCHEDULED", sequence: 50, workstationId: "blister" },
];
const current = resolveCurrentShopFloorOperation(ops, new Set(["pack"]));
assert.equal(current?.id, "pack", "open START wins over first routing step");
assert.equal(shopFloorStepLabel({ operationCode: "QUAR" }), "QA release");
assert.equal(routingStepDisplayName("ENC", "Process"), "Capsule filling");
assert.equal(routingStepDisplayName("COMP", "Process"), "Compression");

const now = new Date("2026-10-26T13:00:00.000Z");
const window = runningBarWindow({
  openStartAt: new Date("2026-10-26T10:10:00.000Z"),
  plannedStart: new Date("2026-10-31T08:00:00.000Z"),
  plannedEnd: new Date("2026-10-31T16:00:00.000Z"),
  now,
});
assert.ok(window.start.getTime() <= now.getTime(), "running bar must not start in the future");
assert.ok(window.end.getTime() >= now.getTime(), "running bar must touch now");

const violations = countRunningOpsByWorkstation(
  [
    { workstationId: "blend", isRunning: true },
    { workstationId: "blend", isRunning: true },
    { workstationId: "pack", isRunning: true },
  ],
  new Map([
    ["blend", 1],
    ["pack", 1],
  ])
);
assert.equal(violations.length, 1);
assert.equal(violations[0]?.workstationId, "blend");

const lateIds = listDeliveryLateOrderIds(
  [
    {
      id: "late",
      orderKind: "FIRM",
      dueDate: "2026-10-20T17:00:00.000Z",
      routing: { operations: [{ id: "a", status: "SCHEDULED", plannedStart: "2026-10-21T08:00:00.000Z", plannedEnd: "2026-10-22T16:00:00.000Z" }] },
    },
    {
      id: "on-time",
      orderKind: "FIRM",
      dueDate: "2026-10-30T17:00:00.000Z",
      routing: { operations: [{ id: "b", status: "SCHEDULED", plannedStart: "2026-10-21T08:00:00.000Z", plannedEnd: "2026-10-22T16:00:00.000Z" }] },
    },
  ],
  new Map([
    ["late", "2026-10-22T16:00:00.000Z"],
    ["on-time", "2026-10-22T16:00:00.000Z"],
  ])
);
assert.deepEqual(lateIds, ["late"]);

const adherence = computeScheduleAdherence([
  {
    status: "COMPLETED",
    plannedEnd: new Date("2026-10-01T16:00:00.000Z"),
    actualCompletion: new Date("2026-10-01T16:20:00.000Z"),
  },
]);
assert.equal(adherence.adherencePercent, 100, "±30 min tolerance");

console.log("verify-running-shop-floor: OK");
