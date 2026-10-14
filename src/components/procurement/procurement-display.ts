import type { MaterialRisk } from "@/lib/materials/types";
import type { ProcurementRowStatus } from "@/lib/procurement/types";
import type { StatusTone } from "@/types/status";

export const riskTone: Record<MaterialRisk, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "warning",
  OK: "success",
};

export const rowStatusTone: Record<ProcurementRowStatus, StatusTone> = {
  RECOMMENDATION: "info",
  MONITOR: "neutral",
  DRAFT: "warning",
  REVIEWED: "success",
  REJECTED: "neutral",
};

export const rowStatusLabel: Record<ProcurementRowStatus, string> = {
  RECOMMENDATION: "Recommendation",
  MONITOR: "Monitor",
  DRAFT: "Draft",
  REVIEWED: "Reviewed",
  REJECTED: "Rejected",
};

export function formatQty(value: number): string {
  return value.toLocaleString("en-KE", { maximumFractionDigits: 3 });
}

export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
