/**
 * Operations planner semantics — blue (planned/active), green (in progress / healthy),
 * amber (warnings / material). Values mirror Pharmora chart tokens (--chart-1/2/3).
 */
export const OPERATIONS_PALETTE = {
  blue: "#5B8CFF",
  green: "#39C6B0",
  yellow: "#D6A85F",
} as const;

/** Gantt job bar — saturated fills (Skyplanner-style), readable on dark canvas. */
export function ganttJobColorClasses(
  displayStatus: "SCHEDULED" | "AT_RISK" | "UNSCHEDULED",
  status: string
): string {
  if (displayStatus === "AT_RISK") {
    return "border-[color-mix(in_srgb,var(--danger)_88%,#000)] bg-[color-mix(in_srgb,var(--danger)_78%,#1a0808)] text-white before:bg-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]";
  }
  if (status === "IN_PROGRESS") {
    return "border-[color-mix(in_srgb,var(--pharmora-secondary)_90%,#000)] bg-[color-mix(in_srgb,var(--pharmora-secondary)_72%,#061512)] text-white before:bg-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]";
  }
  return "border-[color-mix(in_srgb,var(--primary)_92%,#000)] bg-[color-mix(in_srgb,var(--primary)_68%,#0a1428)] text-primary-foreground before:bg-primary-foreground/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]";
}

export function ganttJobSubtextClasses(
  displayStatus: "SCHEDULED" | "AT_RISK" | "UNSCHEDULED",
  status: string
): string {
  if (displayStatus === "AT_RISK" || status === "IN_PROGRESS") {
    return "text-white/85";
  }
  return "text-primary-foreground/80";
}

export const ganttCapacityStripClasses = {
  available:
    "bg-[color-mix(in_srgb,var(--pharmora-secondary)_62%,#061512)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--pharmora-secondary)_85%,#000)]",
  warning:
    "bg-[color-mix(in_srgb,var(--warning)_58%,#1a1408)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--warning)_82%,#000)]",
  danger:
    "bg-[color-mix(in_srgb,var(--danger)_55%,#1a0808)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--danger)_80%,#000)]",
  nonWorking: "bg-muted/45 ring-1 ring-inset ring-border/70",
} as const;

export const plannerLegendSwatches = {
  availableCapacity: ganttCapacityStripClasses.available,
  nonWorking: ganttCapacityStripClasses.nonWorking,
  scheduled:
    "border border-[color-mix(in_srgb,var(--primary)_92%,#000)] bg-[color-mix(in_srgb,var(--primary)_68%,#0a1428)] ring-1 ring-inset ring-primary/50",
  inProgress:
    "border border-[color-mix(in_srgb,var(--pharmora-secondary)_90%,#000)] bg-[color-mix(in_srgb,var(--pharmora-secondary)_72%,#061512)] ring-1 ring-inset ring-intel/55",
  materialWarning:
    "border border-[color-mix(in_srgb,var(--warning)_85%,#000)] bg-[color-mix(in_srgb,var(--warning)_55%,#1a1408)] ring-1 ring-inset ring-warning/55",
  atRisk:
    "border border-[color-mix(in_srgb,var(--danger)_88%,#000)] bg-[color-mix(in_srgb,var(--danger)_78%,#1a0808)]",
} as const;

/** Cycle accent for operation routing steps (visual sequence, not status). */
export const routingStepBorderClass = ["border-l-primary", "border-l-intel", "border-l-warning"] as const;

export function routingStepBorder(index: number): string {
  return routingStepBorderClass[index % routingStepBorderClass.length];
}
