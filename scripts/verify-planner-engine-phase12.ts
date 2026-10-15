import assert from "node:assert/strict";

import {
  bulldozePastOperations,
  filterOrdersUnscheduledOnly,
  lockOperationsOutsideWorkstationScope,
} from "../src/lib/operations/planner-engine-actions";
import { planningWeightsFromPolicy } from "../src/lib/operations/planner-policy-weights";
import { scoreScheduleObjective } from "../src/lib/operations/schedule-optimizer";
import type { RoutingOrder } from "../src/lib/operations/routing";

const now = new Date("2026-10-15T12:00:00.000Z");
const bulldozed = bulldozePastOperations(
  [
    {
      id: "op1",
      orderId: "o1",
      orderNumber: "P-1",
      sequence: 1,
      durationMinutes: 60,
      setupMinutes: 0,
      teardownMinutes: 0,
      changeoverFamily: "A",
      resources: [{ workstationId: "ws1", efficiencyPercent: 100, preferred: true }],
      locked: false,
      workstationId: "ws1",
      plannedStart: new Date("2026-10-14T08:00:00.000Z"),
      plannedEnd: new Date("2026-10-14T09:00:00.000Z"),
    },
  ],
  now,
  () => false
);
assert.equal(bulldozed[0]?.plannedStart, null);

const scoped = lockOperationsOutsideWorkstationScope(
  [
    {
      id: "a",
      orderId: "o",
      orderNumber: "P",
      sequence: 1,
      durationMinutes: 10,
      setupMinutes: 0,
      teardownMinutes: 0,
      changeoverFamily: null,
      resources: [{ workstationId: "ws-a", efficiencyPercent: 100, preferred: true }],
      locked: false,
      workstationId: null,
      plannedStart: null,
      plannedEnd: null,
    },
    {
      id: "b",
      orderId: "o",
      orderNumber: "P",
      sequence: 2,
      durationMinutes: 10,
      setupMinutes: 0,
      teardownMinutes: 0,
      changeoverFamily: null,
      resources: [{ workstationId: "ws-b", efficiencyPercent: 100, preferred: true }],
      locked: false,
      workstationId: null,
      plannedStart: null,
      plannedEnd: null,
    },
  ],
  "ws-a",
  null,
  () => false
);
assert.equal(scoped[0]?.locked, false);
assert.equal(scoped[1]?.locked, true);

const weights = planningWeightsFromPolicy({
  priorityWeight: 10,
  dueDateWeight: 20,
  changeoverWeight: 5,
  utilizationWeight: 5,
});
assert.equal(weights.leadTimeWeight, 25);

const orders: RoutingOrder[] = [
  {
    id: "1",
    orderNumber: "A",
    priority: "NORMAL",
    dueDate: new Date("2026-11-01"),
    createdAt: now,
    fastTrack: true,
    operations: [],
  },
  {
    id: "2",
    orderNumber: "B",
    priority: "CRITICAL",
    dueDate: new Date("2026-10-20"),
    createdAt: now,
    operations: [],
  },
];

const unscheduledOnly = filterOrdersUnscheduledOnly([
  {
    ...orders[0],
    operations: [
      {
        id: "x",
        orderId: "1",
        orderNumber: "A",
        sequence: 1,
        durationMinutes: 1,
        setupMinutes: 0,
        teardownMinutes: 0,
        changeoverFamily: null,
        resources: [],
        locked: false,
        workstationId: null,
        plannedStart: new Date(),
        plannedEnd: new Date(),
      },
    ],
  },
  {
    ...orders[1],
    operations: [
      {
        id: "y",
        orderId: "2",
        orderNumber: "B",
        sequence: 1,
        durationMinutes: 1,
        setupMinutes: 0,
        teardownMinutes: 0,
        changeoverFamily: null,
        resources: [],
        locked: false,
        workstationId: null,
        plannedStart: null,
        plannedEnd: null,
      },
    ],
  },
]);
assert.equal(unscheduledOnly.length, 1);
assert.equal(unscheduledOnly[0]?.orderNumber, "B");

const score = scoreScheduleObjective({
  orders: [orders[1]],
  operations: [],
  issues: [],
  weights,
});
assert.ok(score >= 0);

console.log("verify-planner-engine-phase12: OK");
