import assert from "node:assert/strict";

import {
  filterOpenStationJobs,
  formatPauseReason,
  sortStationQueue,
} from "../src/lib/production-execution/shop-floor";
import type { ExecutionOrderRow } from "../src/lib/production-execution/types";

function row(partial: Partial<ExecutionOrderRow> & Pick<ExecutionOrderRow, "id" | "orderNumber">): ExecutionOrderRow {
  return {
    productId: "p1",
    productName: "Product",
    productSku: "SKU",
    unit: "tab",
    workstationId: "ws1",
    workstationName: "Line",
    workstationActive: true,
    priority: "NORMAL",
    planningStatus: "SCHEDULED",
    executionState: "WAITING",
    plannedQuantity: 100,
    producedQuantity: null,
    remainingQuantity: null,
    progressPercent: null,
    progressLabel: "—",
    plannedStart: null,
    plannedEnd: null,
    dueDate: new Date().toISOString(),
    orderKind: "FIRM",
    actualStart: null,
    actualCompletion: null,
    plannedDurationMinutes: null,
    actualDurationMinutes: null,
    durationVarianceMinutes: null,
    quantityVariance: null,
    risk: "ON_TRACK",
    riskEvidence: "",
    batchId: null,
    batchNumber: null,
    materialReadiness: null,
    isReleased: false,
    isPaused: false,
    canRelease: true,
    canStart: false,
    canPause: false,
    canResume: false,
    canComplete: false,
    requiresLineClearance: false,
    lineClearanceComplete: false,
    canSignLineClearance: false,
    history: [],
    activeOperationId: null,
    activeOperationCode: null,
    shopFloorEvents: [],
    ...partial,
  };
}

const sorted = sortStationQueue([
  row({ id: "b", orderNumber: "B", executionState: "WAITING", plannedStart: "2026-10-10T08:00:00.000Z" }),
  row({ id: "a", orderNumber: "A", executionState: "IN_PROGRESS", plannedStart: "2026-10-11T08:00:00.000Z" }),
  row({ id: "c", orderNumber: "C", executionState: "RELEASED", plannedStart: "2026-10-09T08:00:00.000Z" }),
]);

assert.equal(sorted[0]?.orderNumber, "A", "in-progress first");
assert.equal(sorted[1]?.orderNumber, "C", "released before waiting");
assert.equal(sorted[2]?.orderNumber, "B");

const open = filterOpenStationJobs([
  ...sorted,
  row({ id: "d", orderNumber: "D", executionState: "COMPLETED" }),
]);
assert.equal(open.length, 3);

assert.equal(formatPauseReason("BREAKDOWN"), "Breakdown");
assert.equal(formatPauseReason("unknown"), "unknown");

console.log("verify-shop-floor: OK");
