import assert from "node:assert/strict";

import { buildOperationSchedule } from "../src/lib/operations/routing";
import { buildOptimizedOperationSchedule, scoreScheduleObjective } from "../src/lib/operations/schedule-optimizer";

const start = new Date("2026-10-05T08:00:00.000Z");
const workstations = [
  { id: "line-a", code: "LA", capacityHoursPerDay: 8 },
  { id: "line-b", code: "LB", capacityHoursPerDay: 8 },
];

const orders = [
  {
    id: "late",
    orderNumber: "MO-LATE",
    priority: "NORMAL" as const,
    dueDate: new Date("2026-10-06T12:00:00.000Z"),
    createdAt: start,
    operations: [
      {
        id: "op-late",
        orderId: "late",
        orderNumber: "MO-LATE",
        sequence: 10,
        durationMinutes: 360,
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
  },
  {
    id: "soon",
    orderNumber: "MO-SOON",
    priority: "HIGH" as const,
    dueDate: new Date("2026-10-05T18:00:00.000Z"),
    createdAt: start,
    operations: [
      {
        id: "op-soon",
        orderId: "soon",
        orderNumber: "MO-SOON",
        sequence: 10,
        durationMinutes: 120,
        setupMinutes: 0,
        teardownMinutes: 0,
        changeoverFamily: "GENERAL",
        resources: [
          { workstationId: "line-a", efficiencyPercent: 100, preferred: true },
          { workstationId: "line-b", efficiencyPercent: 100, preferred: false },
        ],
        locked: false,
        workstationId: null,
        plannedStart: null,
        plannedEnd: null,
      },
    ],
  },
];

const input = {
  orders,
  dependencies: [],
  workstations,
  changeovers: [],
  windowStart: start,
  weights: {
    priorityWeight: 40,
    dueDateWeight: 60,
    changeoverWeight: 10,
    utilizationWeight: 10,
    leadTimeWeight: 25,
    onTimeCountWeight: 30,
    customerPriorityWeight: 20,
    similarJobsWeight: 15,
    eligibilityWeight: 10,
  },
};

const forward = buildOperationSchedule(input);
const optimized = buildOptimizedOperationSchedule(input);
const forwardScore = scoreScheduleObjective({ orders, operations: forward.operations, issues: forward.issues });
const optimizedScore = scoreScheduleObjective({ orders, operations: optimized.operations, issues: optimized.issues });

assert.ok(optimizedScore <= forwardScore, "Global optimizer should not worsen the objective score");
assert.ok(optimized.iterations >= 1, "Optimizer should report iteration count");

console.log("Operations optimizer verification passed.");
