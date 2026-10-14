import assert from "node:assert/strict";

import { segregationTransitionRequiresClean } from "../src/lib/operations/changeover-segregation";
import { computeScheduleAdherence, computePlannerStability } from "../src/lib/operations/schedule-adherence";

assert.equal(segregationTransitionRequiresClean("GENERAL", "BETA_LACTAM"), true);
assert.equal(segregationTransitionRequiresClean("GENERAL", "GENERAL"), false);

const adherence = computeScheduleAdherence([
  {
    status: "COMPLETED",
    plannedEnd: new Date("2026-10-01T16:00:00.000Z"),
    actualCompletion: new Date("2026-10-01T15:00:00.000Z"),
  },
  {
    status: "COMPLETED",
    plannedEnd: new Date("2026-10-02T16:00:00.000Z"),
    actualCompletion: new Date("2026-10-02T18:00:00.000Z"),
  },
]);
assert.equal(adherence.adherencePercent, 50);
assert.equal(adherence.lateCount, 1);

const stability = computePlannerStability({
  previousStarts: new Map([
    ["a", 100],
    ["b", 200],
  ]),
  proposedStarts: new Map([
    ["a", 100],
    ["b", 300],
  ]),
});
assert.equal(stability.movedOrders, 1);
assert.equal(stability.stabilityPercent, 50);

console.log("Operations partial-gap verification passed.");
