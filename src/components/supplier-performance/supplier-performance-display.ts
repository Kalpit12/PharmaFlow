import type { PerformanceBand, SupplierPerformanceViewId } from "@/lib/supplier-performance/types";
import type { StatusTone } from "@/types/status";

export const VIEW_LABEL: Record<SupplierPerformanceViewId, string> = {
  all: "All",
  history: "With history",
  attention: "Needs attention",
  excellent: "Excellent / Strong",
  risk: "Watch / Risk",
  insufficient: "Insufficient data",
};

export const bandTone: Record<PerformanceBand, StatusTone> = {
  EXCELLENT: "success",
  STRONG: "success",
  WATCH: "warning",
  RISK: "danger",
  INSUFFICIENT_DATA: "neutral",
};

export function bandLabel(band: PerformanceBand): string {
  return band.replaceAll("_", " ");
}
