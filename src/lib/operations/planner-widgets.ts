import type { PlannerWidgetType } from "@prisma/client";

export type PlannerWidgetDefinition = {
  type: PlannerWidgetType;
  label: string;
  description: string;
};

export const PLANNER_WIDGET_CATALOG: PlannerWidgetDefinition[] = [
  { type: "KPI_STRIP", label: "KPI strip", description: "OTIF, adherence, late jobs, changeover, started/completed." },
  { type: "CAPACITY_LOAD_FACTOR", label: "Daily load factor", description: "Scheduled load ÷ capacity by day." },
  { type: "WORKSTATION_UTILIZATION", label: "Workstation utilization", description: "Finite-capacity load by line." },
  { type: "BOTTLENECK", label: "Bottleneck", description: "Highest-utilization workstation." },
  { type: "OEE_BY_WORKSTATION", label: "OEE by workstation", description: "Shop-floor availability × performance × quality proxy." },
  { type: "JOB_REPORT", label: "Job report", description: "Scheduled orders in the date range." },
  { type: "TIMELOG_REPORT", label: "All timelogs", description: "Shop-floor operation events." },
  { type: "ORDER_ITEM_REPORT", label: "Order item report", description: "Production order lines with due dates." },
  { type: "OTIF", label: "On-time delivery", description: "OTIF KPI tile." },
  { type: "SCHEDULE_ADHERENCE", label: "Schedule adherence", description: "Planned vs actual completion." },
  { type: "LATE_JOBS", label: "Late jobs", description: "At-risk count in horizon." },
  { type: "JOBS_STARTED_COMPLETED", label: "Jobs started / completed", description: "Throughput in window." },
  { type: "CHANGEOVER_HOURS", label: "Changeover hours", description: "Planned cleaning/setup hours." },
];

export const DEFAULT_DASHBOARD_WIDGETS: PlannerWidgetType[] = [
  "KPI_STRIP",
  "CAPACITY_LOAD_FACTOR",
  "WORKSTATION_UTILIZATION",
  "BOTTLENECK",
  "OEE_BY_WORKSTATION",
  "JOB_REPORT",
  "TIMELOG_REPORT",
  "ORDER_ITEM_REPORT",
];

export function widgetLabel(type: PlannerWidgetType): string {
  return PLANNER_WIDGET_CATALOG.find((row) => row.type === type)?.label ?? type;
}

/** Reorder widget types by drag-and-drop id list; unknown ids are ignored. */
export function reorderWidgetTypes(current: PlannerWidgetType[], ordered: PlannerWidgetType[]): PlannerWidgetType[] {
  const set = new Set(current);
  const next: PlannerWidgetType[] = [];
  for (const type of ordered) {
    if (set.has(type)) {
      next.push(type);
      set.delete(type);
    }
  }
  for (const type of current) {
    if (set.has(type)) next.push(type);
  }
  return next;
}
