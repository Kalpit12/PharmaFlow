import type { ExecutionOrderRow, ExecutionState } from "@/lib/production-execution/types";

export const SHOP_FLOOR_PAUSE_REASONS = [
  { id: "BREAKDOWN", label: "Breakdown" },
  { id: "MATERIAL_MISSING", label: "Material missing" },
  { id: "WAITING_QA", label: "Waiting QA" },
  { id: "OPERATOR_BREAK", label: "Operator break" },
] as const;

export type ShopFloorPauseReasonId = (typeof SHOP_FLOOR_PAUSE_REASONS)[number]["id"];

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
