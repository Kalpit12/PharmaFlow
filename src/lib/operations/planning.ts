import type { MaterialRequirement } from "@/lib/materials/types";
import { utilizationTone } from "@/lib/charts/tokens";
import type { ChartTone } from "@/lib/charts/types";
import type { ScheduleConflict } from "@/lib/operations/schedule";

export const PLANNING_CONFLICT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type PlanningConflictSeverity = (typeof PLANNING_CONFLICT_SEVERITIES)[number];

export const MATERIAL_READINESS_STATES = ["READY", "AT_RISK", "SHORTAGE", "UNKNOWN"] as const;
export type MaterialReadinessState = (typeof MATERIAL_READINESS_STATES)[number];

/** Statuses where schedule/workstation mutations are permitted. */
export const PLANNING_MUTABLE_STATUSES = ["UNSCHEDULED", "SCHEDULED", "AT_RISK"] as const;
export type PlanningMutableStatus = (typeof PLANNING_MUTABLE_STATUSES)[number];

export type OrderMaterialReadiness = {
  state: MaterialReadinessState;
  shortageCount: number;
  affectedMaterials: string[];
};

export type PlanningAttentionItem = {
  id: string;
  severity: PlanningConflictSeverity;
  title: string;
  detail: string;
  count: number;
  href: string;
  view: "schedule" | "capacity" | "attention";
  focus?: "all" | "risk" | "critical" | "unscheduled" | "locked" | "material" | "conflict";
};

export function isPlanningMutableStatus(status: string): status is PlanningMutableStatus {
  return (PLANNING_MUTABLE_STATUSES as readonly string[]).includes(status);
}

export function capacityStateFromUtilization(utilization: number): "OK" | "WARNING" | "DANGER" {
  const tone = utilizationTone(utilization);
  if (tone === "danger") return "DANGER";
  if (tone === "warning") return "WARNING";
  return "OK";
}

export function capacityToneFromUtilization(utilization: number): ChartTone {
  return utilizationTone(utilization);
}

export function computeOrderMaterialReadiness(
  materials: MaterialRequirement[],
  orderId: string,
  hasBomDemand: boolean
): OrderMaterialReadiness {
  if (!hasBomDemand) {
    return { state: "UNKNOWN", shortageCount: 0, affectedMaterials: [] };
  }

  const affected: MaterialRequirement[] = [];
  for (const row of materials) {
    if (row.affectedOrders.some((order) => order.id === orderId)) affected.push(row);
  }

  if (affected.length === 0) {
    return { state: "UNKNOWN", shortageCount: 0, affectedMaterials: [] };
  }

  const shortages = affected.filter((row) => row.shortage);
  if (shortages.length > 0) {
    return {
      state: "SHORTAGE",
      shortageCount: shortages.length,
      affectedMaterials: shortages.map((row) => row.name).slice(0, 6),
    };
  }

  const atRisk = affected.some((row) => row.risk !== "OK");
  if (atRisk) {
    return {
      state: "AT_RISK",
      shortageCount: 0,
      affectedMaterials: affected.filter((row) => row.risk !== "OK").map((row) => row.name).slice(0, 6),
    };
  }

  return { state: "READY", shortageCount: 0, affectedMaterials: [] };
}

export function buildPlanningAttention(input: {
  conflicts: ScheduleConflict[];
  materialShortageOrderCount: number;
  unscheduledCount: number;
  missingReviewCount: number;
  overCapacityWorkstations: number;
  highUtilizationWorkstations: number;
}): PlanningAttentionItem[] {
  const items: PlanningAttentionItem[] = [];

  const overlapCount = input.conflicts.filter((row) => row.kind === "overlap").length;
  if (overlapCount > 0) {
    items.push({
      id: "overlap",
      severity: "WARNING",
      title: `${overlapCount} overlapping production ${overlapCount === 1 ? "order" : "orders"}`,
      detail: "Jobs share the same workstation time window.",
      count: overlapCount,
      href: "/operations?view=attention",
      view: "attention",
      focus: "conflict",
    });
  }

  if (input.overCapacityWorkstations > 0) {
    items.push({
      id: "over-capacity",
      severity: "CRITICAL",
      title: `${input.overCapacityWorkstations} ${input.overCapacityWorkstations === 1 ? "workstation exceeds" : "workstations exceed"} daily capacity`,
      detail: "Scheduled load is above finite capacity for at least one day.",
      count: input.overCapacityWorkstations,
      href: "/operations?view=capacity",
      view: "capacity",
    });
  } else if (input.highUtilizationWorkstations > 0) {
    items.push({
      id: "high-utilization",
      severity: "WARNING",
      title: `${input.highUtilizationWorkstations} ${input.highUtilizationWorkstations === 1 ? "workstation above" : "workstations above"} 85% utilization`,
      detail: "Capacity is tight — review sequence before releasing more work.",
      count: input.highUtilizationWorkstations,
      href: "/operations?view=capacity",
      view: "capacity",
    });
  }

  if (input.materialShortageOrderCount > 0) {
    items.push({
      id: "material-shortage",
      severity: "CRITICAL",
      title: `${input.materialShortageOrderCount} ${input.materialShortageOrderCount === 1 ? "order has" : "orders have"} material shortage`,
      detail: "Confirmed shortages against open production demand.",
      count: input.materialShortageOrderCount,
      href: "/materials?view=shortages",
      view: "schedule",
      focus: "material",
    });
  }

  if (input.unscheduledCount > 0) {
    items.push({
      id: "unscheduled",
      severity: "INFO",
      title: `${input.unscheduledCount} unscheduled ${input.unscheduledCount === 1 ? "order" : "orders"}`,
      detail: "No start time is assigned on the Gantt.",
      count: input.unscheduledCount,
      href: "/operations?view=schedule",
      view: "schedule",
      focus: "unscheduled",
    });
  }

  if (input.missingReviewCount > 0) {
    items.push({
      id: "needs-review",
      severity: "WARNING",
      title: `${input.missingReviewCount} ${input.missingReviewCount === 1 ? "order requires" : "orders require"} scheduling review`,
      detail: "Missing workstation, invalid duration, or incomplete planning data.",
      count: input.missingReviewCount,
      href: "/operations?view=attention",
      view: "attention",
      focus: "conflict",
    });
  }

  const deliveryRisk = input.conflicts.filter((row) => row.kind === "delivery-risk").length;
  if (deliveryRisk > 0) {
    items.push({
      id: "delivery-risk",
      severity: "CRITICAL",
      title: `${deliveryRisk} ${deliveryRisk === 1 ? "order is" : "orders are"} at delivery risk`,
      detail: "Planned completion is after the due date.",
      count: deliveryRisk,
      href: "/operations?view=schedule",
      view: "schedule",
      focus: "risk",
    });
  }

  return items;
}
