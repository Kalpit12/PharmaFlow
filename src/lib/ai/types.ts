/**
 * Shared primitives for the Pharmaflow AI intelligence layer (Phase 5B).
 * Contracts only — no provider, API, or database.
 */

export type DataMode = "demonstration" | "live";

/** Standard analysis windows. CUSTOM is reserved; no date parser in this phase. */
export type TimeRangePreset = "7D" | "30D" | "90D" | "12M" | "CUSTOM";

export type TimeRange = {
  preset: TimeRangePreset;
  /** ISO dates — populate only when preset is CUSTOM (future). */
  start?: string;
  end?: string;
  /** Natural-language hint, e.g. "last 30 days". Not parsed in this phase. */
  label?: string;
};

export const DEFAULT_TIME_RANGE: TimeRange = {
  preset: "30D",
  label: "last 30 days",
};

export type EntityKind = "product" | "customer" | "region" | "rfq" | "order" | "timeRange";

export type AIEntity = {
  kind: EntityKind;
  /** Canonical id when known (e.g. dashboard product id `amox`). */
  id?: string;
  /** Display / extracted surface form (e.g. "Amoxicillin", "Uganda"). */
  value: string;
};

export type ContextSlice =
  | "executiveMetrics"
  | "salesPerformance"
  | "products"
  | "customers"
  | "rfqs"
  | "regionalPerformance"
  | "opportunities"
  | "attentionItems"
  | "recentActivity"
  | "dailyReview"
  | "forecast"
  | "scenario"
  | "procurementRfq"
  | "purchaseOrder"
  | "supplierPerformance"
  | "report";

export type PromptLayer =
  | "system"
  | "businessContext"
  | "userQuestion"
  | "toolResults"
  | "responseFormat";
