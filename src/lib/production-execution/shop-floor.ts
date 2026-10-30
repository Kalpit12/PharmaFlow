import { PAUSE_REASON_CODES, PAUSE_REASON_LABELS, type PauseReasonCode } from "@/lib/production-execution/pause-reasons";
import type { ExecutionOrderRow, ExecutionState } from "@/lib/production-execution/types";

/** One list for Execution, station queue and Timer (codes live in pause-reasons.ts). */
export const SHOP_FLOOR_PAUSE_REASONS = PAUSE_REASON_CODES.map((id) => ({ id, label: PAUSE_REASON_LABELS[id] }));

export type ShopFloorPauseReasonId = PauseReasonCode;

const STATE_QUEUE_RANK: Record<ExecutionState, number> = {
  IN_PROGRESS: 0,
  PAUSED: 1,
  RELEASED: 2,
  WAITING: 3,
  COMPLETED: 4,
};

/** Scheduled order for a station: running first, then by planned start. */
export function sortStationQueue(rows: ExecutionOrderRow[]): ExecutionOrderRow[] {
  return [...rows].sort(
    (a, b) =>
      STATE_QUEUE_RANK[a.executionState] - STATE_QUEUE_RANK[b.executionState] ||
      (a.plannedStart ?? "9999").localeCompare(b.plannedStart ?? "9999") ||
      a.orderNumber.localeCompare(b.orderNumber)
  );
}

export function filterOpenStationJobs(rows: ExecutionOrderRow[]): ExecutionOrderRow[] {
  return rows.filter(
    (row) =>
      row.executionState === "IN_PROGRESS" ||
      row.executionState === "PAUSED" ||
      row.executionState === "RELEASED" ||
      row.executionState === "WAITING"
  );
}

export function formatPauseReason(reasonId: string | null | undefined): string {
  if (!reasonId) return "Unspecified";
  const match = SHOP_FLOOR_PAUSE_REASONS.find((row) => row.id === reasonId);
  return match?.label ?? reasonId;
}
