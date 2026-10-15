/** SkyPlanner-aligned Gantt bar tones for dark operations canvas (saturated, readable). */

export type GanttBarTone =
  | "scheduled"
  | "running"
  | "completed"
  | "late"
  | "prospect"
  | "qcHold"
  | "changeover"
  | "ghost";

export const ganttBarFillClass: Record<GanttBarTone, string> = {
  scheduled: "bg-[#1d4ed8]",
  running: "bg-[#15803d]",
  completed: "bg-[#475569]",
  late: "bg-[#b91c1c]",
  prospect: "bg-[#a16207]",
  qcHold: "bg-[#6d28d9]",
  changeover: "bg-[#334155]",
  ghost: "bg-sky-500/35 ring-1 ring-sky-400/50",
};

export function toneForOperation(input: {
  orderKind: "FIRM" | "PROSPECT";
  operationStatus: string;
  orderStatus: string;
  plannedEnd: string | null;
  dueDate: string;
  isQcHold?: boolean;
}): GanttBarTone {
  if (input.isQcHold) return "qcHold";
  if (input.orderKind === "PROSPECT") return "prospect";
  if (input.operationStatus === "COMPLETED") return "completed";
  if (input.operationStatus === "IN_PROGRESS" || input.operationStatus === "PAUSED") return "running";
  if (input.plannedEnd && new Date(input.plannedEnd).getTime() > new Date(input.dueDate).getTime()) {
    return "late";
  }
  if (input.orderStatus === "AT_RISK") return "late";
  return "scheduled";
}
