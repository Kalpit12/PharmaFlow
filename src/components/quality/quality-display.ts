import type { QualityExceptionSeverity, QualityExceptionStatus, QualityViewId } from "@/lib/quality/types";
import type { StatusTone } from "@/types/status";

export const VIEW_LABEL: Record<QualityViewId, string> = {
  all: "All exceptions",
  open: "Open",
  critical: "Critical / high",
  overdue: "Overdue",
  unassigned: "Unassigned",
};

export const severityTone: Record<QualityExceptionSeverity, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "material",
  LOW: "intel",
};

export const statusTone: Record<QualityExceptionStatus, StatusTone> = {
  OPEN: "info",
  INVESTIGATING: "material",
  ACTION_REQUIRED: "warning",
  RESOLVED: "intel",
  CLOSED: "intel",
};

export const severityRank: Record<QualityExceptionSeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
