import assert from "node:assert/strict";

import { buildOperationSchedule, type RoutingOrder } from "../src/lib/operations/routing";

const start = new Date("2026-10-05T08:00:00.000Z");
const workstations = [
  { id: "tablet-a", code: "TLA", capacityHoursPerDay: 8 },
  { id: "tablet-b", code: "TLB", capacityHoursPerDay: 8 },
  { id: "pack-a", code: "PLA", capacityHoursPerDay: 8 },
];

function order(id: string, operations: RoutingOrder["operations"]): RoutingOrder {
  return {
    id,
    orderNumber: id,
    priority: "NORMAL",
    dueDate: new Date("2026-10-20T16:00:00.000Z"),
    createdAt: start,
    operations,
  };
}

const first = order("MO-1", [
  {
    id: "mix-1",
    orderId: "MO-1",
    orderNumber: "MO-1",
    sequence: 10,
    durationMinutes: 120,
    setupMinutes: 15,
    teardownMinutes: 15,
    changeoverFamily: "GENERAL",
    resources: [
      { workstationId: "tablet-a", efficiencyPercent: 100, preferred: true },
      { workstationId: "tablet-b", efficiencyPercent: 80, preferred: false },
    ],
    locked: false,
    workstationId: null,
    plannedStart: null,
    plannedEnd: null,
  },
  {
    id: "pack-1",
    orderId: "MO-1",
    orderNumber: "MO-1",
    sequence: 20,
    durationMinutes: 60,
    setupMinutes: 0,
    teardownMinutes: 0,
    changeoverFamily: "GENERAL",
    resources: [{ workstationId: "pack-a", efficiencyPercent: 100, preferred: true }],
    locked: false,
    workstationId: null,
    plannedStart: null,
    plannedEnd: null,
  },
]);

const second = order("MO-2", [
  {
    id: "mix-2",
    orderId: "MO-2",
    orderNumber: "MO-2",
    sequence: 10,
    durationMinutes: 60,
    setupMinutes: 0,
    teardownMinutes: 0,
    changeoverFamily: "BETA_LACTAM",
    resources: [{ workstationId: "tablet-a", efficiencyPercent: 100, preferred: true }],
    locked: false,
    workstationId: null,
    plannedStart: null,
    plannedEnd: null,
  },
]);

const schedule = buildOperationSchedule({
  orders: [first, second],
  dependencies: [{ fromOperationId: "mix-1", toOperationId: "pack-1", minimumLagMinutes: 30 }],
  workstations,
  changeovers: [
    {
      id: "clean-general-beta",
      workstationId: "tablet-a",
      fromFamily: "GENERAL",
      toFamily: "BETA_LACTAM",
      durationMinutes: 90,
    },
  ],
  windowStart: start,
});

assert.equal(schedule.issues.length, 0);
const mix1 = schedule.operations.find((row) => row.id === "mix-1")!;
const pack1 = schedule.operations.find((row) => row.id === "pack-1")!;
const mix2 = schedule.operations.find((row) => row.id === "mix-2")!;
assert.equal(mix1.workstationId, "tablet-a", "Preferred qualified resource wins an equal-time choice");
assert.equal(mix1.plannedEnd?.toISOString(), "2026-10-05T10:30:00.000Z", "Setup and teardown reserve capacity");
assert.equal(pack1.plannedStart?.toISOString(), "2026-10-05T11:00:00.000Z", "Dependency lag is respected");
assert.equal(mix2.changeoverMinutes, 90, "Sequence-dependent cleaning time is applied");
assert.equal(mix2.appliedChangeoverRuleId, "clean-general-beta");
assert.equal(mix2.plannedEnd?.toISOString(), "2026-10-05T13:00:00.000Z");

const frozen = buildOperationSchedule({
  orders: [
    {
      ...first,
      operations: [
        {
          ...first.operations[0],
          locked: false,
          workstationId: "tablet-a",
          plannedStart: new Date("2026-10-05T08:00:00.000Z"),
          plannedEnd: new Date("2026-10-05T10:30:00.000Z"),
        },
        first.operations[1],
      ],
    },
  ],
  dependencies: [{ fromOperationId: "mix-1", toOperationId: "pack-1", minimumLagMinutes: 30 }],
  workstations,
  changeovers: [],
  windowStart: start,
  freezeUntil: new Date("2026-10-06T08:00:00.000Z"),
});
assert.equal(frozen.operations.find((row) => row.id === "mix-1")?.plannedStart?.toISOString(), "2026-10-05T08:00:00.000Z");
assert.equal(
  frozen.operations.find((row) => row.id === "pack-1")?.plannedStart?.toISOString(),
  "2026-10-05T11:00:00.000Z",
  "Frozen operations keep their committed start while successors still honor lag"
);

const weighted = buildOperationSchedule({
  orders: [
    order("MO-LATE-NORMAL", [
      {
        ...first.operations[0],
        id: "late-normal",
        orderId: "MO-LATE-NORMAL",
        orderNumber: "MO-LATE-NORMAL",
        changeoverFamily: "GENERAL",
        resources: [{ workstationId: "tablet-a", efficiencyPercent: 100, preferred: true }],
      },
    ]),
    {
      ...order("MO-SOON-LOW", [
        {
          ...second.operations[0],
          id: "soon-low",
          orderId: "MO-SOON-LOW",
          orderNumber: "MO-SOON-LOW",
          changeoverFamily: "GENERAL",
          resources: [{ workstationId: "tablet-a", efficiencyPercent: 100, preferred: true }],
        },
      ]),
      priority: "LOW",
      dueDate: new Date("2026-10-06T16:00:00.000Z"),
    },
  ],
  dependencies: [],
  workstations,
  changeovers: [],
  windowStart: start,
  weights: { priorityWeight: 5, dueDateWeight: 95, changeoverWeight: 0, utilizationWeight: 0 },
});
const soonLow = weighted.operations.find((row) => row.id === "soon-low")!;
const lateNormal = weighted.operations.find((row) => row.id === "late-normal")!;
assert.ok(
  soonLow.plannedStart && lateNormal.plannedStart && soonLow.plannedStart.getTime() < lateNormal.plannedStart.getTime(),
  "Due-date weight can schedule a nearer LOW job ahead of a later NORMAL job"
);

const qualification = buildOperationSchedule({
  orders: [
    order("MO-NO-RESOURCE", [
      {
        ...first.operations[0],
        id: "unqualified",
        orderId: "MO-NO-RESOURCE",
        orderNumber: "MO-NO-RESOURCE",
        resources: [{ workstationId: "inactive-line", efficiencyPercent: 100, preferred: true }],
      },
    ]),
  ],
  dependencies: [],
  workstations,
  changeovers: [],
  windowStart: start,
});
assert.equal(qualification.operations[0].plannedStart, null);
assert.equal(qualification.issues[0]?.kind, "NO_QUALIFIED_RESOURCE");

const cycle = buildOperationSchedule({
  orders: [first],
  dependencies: [
    { fromOperationId: "mix-1", toOperationId: "pack-1", minimumLagMinutes: 0 },
    { fromOperationId: "pack-1", toOperationId: "mix-1", minimumLagMinutes: 0 },
  ],
  workstations,
  changeovers: [],
  windowStart: start,
});
assert.equal(cycle.issues.length, 2);
assert.ok(cycle.issues.every((issue) => issue.kind === "CYCLIC_DEPENDENCY"));

console.log("Operations routing verification passed.");
