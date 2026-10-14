import type { BatchQualityStatus, BatchQualityViewId } from "@/lib/batches/types";
import type { StatusTone } from "@/types/status";

export const VIEW_LABEL: Record<BatchQualityViewId, string> = {
  all: "All batches",
  review: "Awaiting review",
  hold: "On hold",
  released: "Released",
  rejected: "Rejected",
};

export const qualityTone: Record<BatchQualityStatus, StatusTone> = {
  PENDING_REVIEW: "info",
  ON_HOLD: "material",
  RELEASED: "intel",
  REJECTED: "danger",
};

export const qualityLabel: Record<BatchQualityStatus, string> = {
  PENDING_REVIEW: "Pending review",
  ON_HOLD: "On hold",
  RELEASED: "Released",
  REJECTED: "Rejected",
};

export const riskTone: Record<"CRITICAL" | "HIGH" | "WARNING" | "OK", StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  WARNING: "warning",
  OK: "intel",
};

export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export const riskRank: Record<"CRITICAL" | "HIGH" | "WARNING" | "OK", number> = {
  CRITICAL: 4,
  HIGH: 3,
  WARNING: 2,
  OK: 1,
};
