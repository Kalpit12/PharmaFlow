import type { ProcurementRfqStatus, ProcurementRfqViewId } from "@/lib/procurement-rfq/types";
import type { StatusTone } from "@/types/status";

export const VIEW_LABEL: Record<ProcurementRfqViewId, string> = {
  all: "All",
  draft: "Draft",
  review: "Review",
  ready: "Ready",
  responses: "Awaiting responses",
  evaluation: "Evaluation",
  awarded: "Awarded",
  closed: "Closed",
};

export const statusTone: Record<ProcurementRfqStatus, StatusTone> = {
  DRAFT: "neutral",
  REVIEW: "neutral",
  READY: "info",
  RESPONSES: "info",
  EVALUATION: "primary",
  AWARDED: "intel",
  CLOSED: "neutral",
  CANCELLED: "neutral",
};

export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
