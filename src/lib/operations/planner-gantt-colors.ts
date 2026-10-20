/** SkyPlanner-aligned Gantt bar tones for dark operations canvas (saturated, readable). */

import { isElapsedOnlyWorkstation } from "@/lib/operations/elapsed-workstation";
import { resolveJobPlanStatus, type JobPlanStatus } from "@/lib/operations/plan-job-status";

export type GanttBarTone =
  | "scheduled"
  | "running"
  | "completed"
  | "late"
  | "prospect"
  | "qcHold"
  | "changeover"
  | "ghost"
  | "maintenance"
  | "elapsedPlanned";

export const ganttBarFillClass: Record<GanttBarTone, string> = {
  scheduled: "bg-[var(--planner-slate)] border border-[var(--planner-slate-border)]",
  running: "bg-[#15803d] border border-[#166534]",
  completed: "bg-[#475569] border border-[#334155]",
  late: "bg-[var(--planner-late-red)] border border-[#991b1b]",
  prospect: "bg-[#9333ea] border border-[#7e22ce]",
  qcHold: "bg-violet-950/30 border-2 border-violet-500",
  changeover:
    "bg-[repeating-linear-gradient(45deg,#374151_0,#374151_3px,#1f2937_3px,#1f2937_6px)] border border-[#374151]",
  ghost: "bg-transparent border border-dashed border-[var(--planner-slate)]",
  maintenance: "bg-[repeating-linear-gradient(45deg,#6b7280_0,#6b7280_4px,#4b5563_4px,#4b5563_8px)]",
  elapsedPlanned: "bg-violet-700 border border-violet-500",
};

export const ganttBarSelectedClass =
  "bg-[var(--planner-select-orange)] border border-[var(--planner-select-orange-border)]";

export function toneForOperation(input: {
  orderKind: "FIRM" | "PROSPECT";
  operationStatus: string;
  orderStatus: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  dueDate: string;
  isQcHold?: boolean;
  workstationCode?: string | null;
  hasActiveTimer?: boolean;
  orderPlannedEnd?: string | null;
  now?: Date;
}): GanttBarTone {
  const status = resolveJobPlanStatus({
    operationStatus: input.operationStatus,
    orderKind: input.orderKind,
    plannedStart: input.plannedStart,
    plannedEnd: input.plannedEnd,
    dueDate: input.dueDate,
    isQcHold: false,
    hasActiveTimer: input.hasActiveTimer,
    orderPlannedEnd: input.orderPlannedEnd,
    now: input.now,
  });
  if (input.workstationCode && isElapsedOnlyWorkstation(input.workstationCode)) {
    return ganttToneFromElapsedJobStatus(status);
  }
  return ganttToneFromJobStatus(status);
}

export function ganttToneFromElapsedJobStatus(status: JobPlanStatus): GanttBarTone {
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "RUNNING":
      return "running";
    case "AT_RISK":
      return "late";
    default:
      return "elapsedPlanned";
  }
}

export function ganttToneFromJobStatus(status: JobPlanStatus): GanttBarTone {
  switch (status) {
    case "QC_HOLD":
      return "elapsedPlanned";
    case "PROSPECT":
      return "prospect";
    case "COMPLETED":
      return "completed";
    case "RUNNING":
      return "running";
    case "AT_RISK":
      return "late";
    case "LATE":
      return "scheduled";
    default:
      return "scheduled";
  }
}
