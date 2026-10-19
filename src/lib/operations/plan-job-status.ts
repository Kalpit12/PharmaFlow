import { SLIPPED_START_GRACE_MS } from "@/lib/operations/schedule-feasibility";

/** Canonical planner job status — use for Gantt, dashboard, engine, integrations. */

export type JobPlanStatus =
  | "PROSPECT"
  | "QC_HOLD"
  | "COMPLETED"
  | "RUNNING"
  | "LATE"
  | "AT_RISK"
  | "SCHEDULED"
  | "UNSCHEDULED";

export function resolveJobPlanStatus(input: {
  operationStatus: string;
  orderKind: "FIRM" | "PROSPECT";
  plannedStart: string | Date | null;
  plannedEnd: string | Date | null;
  dueDate: string | Date;
  isQcHold?: boolean;
  hasActiveTimer?: boolean;
  /** Last operation end on the order (for at-risk). */
  orderPlannedEnd?: string | Date | null;
  now?: Date;
}): JobPlanStatus {
  const now = input.now ?? new Date();
  if (input.isQcHold) return "QC_HOLD";
  if (input.orderKind === "PROSPECT") return "PROSPECT";
  if (input.operationStatus === "COMPLETED") return "COMPLETED";

  if (input.hasActiveTimer) return "RUNNING";

  const dueMs = new Date(input.dueDate).getTime();
  const orderEnd = input.orderPlannedEnd ?? input.plannedEnd;
  if (orderEnd && new Date(orderEnd).getTime() > dueMs) return "AT_RISK";

  if (input.plannedStart) {
    const startMs = new Date(input.plannedStart).getTime();
    if (startMs + SLIPPED_START_GRACE_MS < now.getTime()) return "LATE";
  }

  if (!input.plannedStart || !input.plannedEnd) return "UNSCHEDULED";
  return "SCHEDULED";
}

/** Delivery late (Gantt Late tab, KPIs): order finish after due — not merely a slipped planned start. */
export function jobStatusIsLate(status: JobPlanStatus): boolean {
  return status === "AT_RISK";
}

/** Planned start in the past without a running timer — show "!" on the bar, not red fill. */
export function jobStatusIsScheduleSlip(status: JobPlanStatus): boolean {
  return status === "LATE";
}

export function jobStatusIsRunning(status: JobPlanStatus): boolean {
  return status === "RUNNING";
}
