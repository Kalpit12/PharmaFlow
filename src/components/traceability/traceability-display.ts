import type { TraceabilityCoverage, TraceabilityEntityType, ImpactScope } from "@/lib/traceability/types";
import type { StatusTone } from "@/types/status";

export const ENTITY_LABEL: Record<TraceabilityEntityType, string> = {
  lot: "Material lot",
  batch: "Production batch",
  order: "Sales order",
  customer: "Customer",
};

export const coverageTone: Record<TraceabilityCoverage, StatusTone> = {
  TRACEABLE: "intel",
  PARTIAL: "material",
  NOT_RECORDED: "warning",
};

export function scopeTone(scope: ImpactScope): StatusTone {
  if (scope === "SIGNIFICANT_IMPACT") return "danger";
  if (scope === "LIMITED_IMPACT") return "material";
  if (scope === "NO_KNOWN_IMPACT") return "intel";
  return "warning";
}

export function attentionSeverity(severity: string): "CRITICAL" | "HIGH" | "WATCH" {
  if (severity === "CRITICAL" || severity === "HIGH") return severity;
  return "WATCH";
}
