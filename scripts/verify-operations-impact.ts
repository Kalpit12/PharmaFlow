import assert from "node:assert/strict";

import {
  buildScheduleImpact,
  type ScheduleImpactOrder,
} from "../src/lib/operations/planning";

const orders: ScheduleImpactOrder[] = [
  {
    id: "first",
    orderNumber: "PRO-001",
    workstationId: "line-a",
    plannedStart: "2026-10-06T08:00:00.000Z",
    plannedEnd: "2026-10-06T10:00:00.000Z",
    dueDate: "2026-10-07T00:00:00.000Z",
    quantity: 100,
    displayStatus: "SCHEDULED",
  },
  {
    id: "second",
    orderNumber: "PRO-002",
    workstationId: "line-a",
    plannedStart: "2026-10-06T10:00:00.000Z",
    plannedEnd: "2026-10-06T12:00:00.000Z",
    dueDate: "2026-10-06T11:00:00.000Z",
    quantity: 200,
    displayStatus: "AT_RISK",
  },
  {
    id: "third",
    orderNumber: "PRO-003",
    workstationId: "line-a",
    plannedStart: "2026-10-06T12:00:00.000Z",
    plannedEnd: "2026-10-06T14:00:00.000Z",
    dueDate: "2026-10-07T00:00:00.000Z",
    quantity: 300,
    displayStatus: "SCHEDULED",
  },
  {
    id: "other-line",
    orderNumber: "PRO-004",
    workstationId: "line-b",
    plannedStart: "2026-10-06T09:00:00.000Z",
    plannedEnd: "2026-10-06T11:00:00.000Z",
    dueDate: "2026-10-07T00:00:00.000Z",
    quantity: 400,
    displayStatus: "SCHEDULED",
  },
];

const impact = buildScheduleImpact(orders, "first");
assert.equal(impact.downstreamCount, 2, "counts only later orders on the same workstation");
assert.equal(impact.downstreamQuantity, 500, "totals downstream line quantity");
assert.equal(impact.downstreamAtRiskCount, 1, "counts downstream delivery risk");
assert.deepEqual(impact.downstreamOrderNumbers, ["PRO-002", "PRO-003"], "keeps recorded line sequence");
assert.equal(impact.nextOrderNumber, "PRO-002", "identifies the next recorded order");

const finalImpact = buildScheduleImpact(orders, "third");
assert.equal(finalImpact.downstreamCount, 0, "last line order has no downstream exposure");
assert.equal(finalImpact.nextOrderNumber, null, "last line order has no next order");

const unknownImpact = buildScheduleImpact(orders, "missing");
assert.equal(unknownImpact.downstreamCount, 0, "unknown order returns an honest empty impact");

console.log("Operations schedule-impact verification passed.");
