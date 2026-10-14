import type { SupplierViewId } from "@/lib/suppliers/types";
import type { StatusTone } from "@/types/status";

export const VIEW_LABEL: Record<SupplierViewId, string> = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
  gaps: "Data gaps",
};

export const toneByStatus: Record<string, StatusTone> = {
  ACTIVE: "intel",
  INACTIVE: "neutral",
};

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function coverageTone(coverage: number): StatusTone {
  if (coverage >= 80) return "success";
  if (coverage >= 50) return "info";
  if (coverage >= 25) return "warning";
  return "danger";
}
