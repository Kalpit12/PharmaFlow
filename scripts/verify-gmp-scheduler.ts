import assert from "node:assert/strict";

import { buildOperationSchedule } from "../src/lib/operations/routing";
import { gmpCleanMinutesBeforeJob } from "../src/lib/operations/workstation-gmp";

const start = new Date("2026-10-05T08:00:00.000Z");

assert.equal(
  gmpCleanMinutesBeforeJob(
    { qualificationStatus: "QUALIFIED", calibrationDueDate: null, cleanStatus: "DIRTY", cleanHoldExpiresAt: null },
    start
  ),
  120
);

const result = buildOperationSchedule({
  orders: [
    {
      id: "o1",
      orderNumber: "MO-1",
      priority: "NORMAL",
      dueDate: new Date("2026-10-08T17:00:00.000Z"),
      createdAt: start,
      operations: [
        {
          id: "op1",
          orderId: "o1",
          orderNumber: "MO-1",
          sequence: 1,
          durationMinutes: 60,
          setupMinutes: 0,
          teardownMinutes: 0,
          changeoverFamily: "A",
          resources: [{ workstationId: "ws1", efficiencyPercent: 100, preferred: true }],
          locked: false,
          workstationId: null,
          plannedStart: null,
          plannedEnd: null,
        },
      ],
    },
  ],
  dependencies: [],
  workstations: [
    {
      id: "ws1",
      code: "WS1",
      capacityHoursPerDay: 8,
      gmp: {
        qualificationStatus: "QUALIFIED",
        calibrationDueDate: null,
        cleanStatus: "DIRTY",
        cleanHoldExpiresAt: null,
      },
    },
  ],
  changeovers: [],
  windowStart: start,
});

const op = result.operations[0];
assert.ok(op.plannedStart && op.plannedEnd);
assert.ok(op.changeoverMinutes >= 120, "dirty workstation should reserve major clean minutes");

console.log("verify-gmp-scheduler: OK");
