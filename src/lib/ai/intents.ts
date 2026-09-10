import type { AIEntity, ContextSlice, TimeRange } from "@/lib/ai/types";
import { DEFAULT_TIME_RANGE } from "@/lib/ai/types";

export type AIIntentName =
  | "SALES_PERFORMANCE"
  | "PRODUCT_PERFORMANCE"
  | "RFQ_ANALYSIS"
  | "CUSTOMER_ACTIVITY"
  | "REGIONAL_PERFORMANCE"
  | "BUSINESS_SUMMARY"
  | "OPPORTUNITY_ANALYSIS"
  | "ATTENTION_ITEMS"
  | "GENERAL_BUSINESS_QUERY"
  | "DAILY_REVIEW"
  | "OPERATIONAL_PRIORITY"
  | "MATERIAL_RISK"
  | "PROCUREMENT_PRIORITY"
  | "SUPPLIER_COMPARISON"
  | "CROSS_DOMAIN_ANALYSIS"
  | "FORECAST"
  | "SCENARIO"
  | "PROCUREMENT_RFQ"
  | "PURCHASE_ORDER"
  | "SUPPLIER_PERFORMANCE"
  | "EXECUTIVE_REPORT"
  | "UNSUPPORTED";

export type AIIntent = {
  intent: AIIntentName;
  confidence: number;
  entities: AIEntity[];
  timeRange: TimeRange;
  requiredContext: ContextSlice[];
};

/** Minimum context slices per intent — do not load the whole company graph. */
export const INTENT_CONTEXT: Record<AIIntentName, ContextSlice[]> = {
  SALES_PERFORMANCE: ["executiveMetrics", "salesPerformance"],
  PRODUCT_PERFORMANCE: ["products", "rfqs"],
  RFQ_ANALYSIS: ["rfqs", "products", "regionalPerformance", "customers"],
  CUSTOMER_ACTIVITY: ["customers", "attentionItems", "rfqs"],
  REGIONAL_PERFORMANCE: ["regionalPerformance", "products"],
  BUSINESS_SUMMARY: ["executiveMetrics", "products", "attentionItems"],
  OPPORTUNITY_ANALYSIS: ["opportunities", "regionalPerformance", "products"],
  ATTENTION_ITEMS: ["attentionItems"],
  GENERAL_BUSINESS_QUERY: ["executiveMetrics"],
  DAILY_REVIEW: ["dailyReview"],
  OPERATIONAL_PRIORITY: ["dailyReview"],
  MATERIAL_RISK: ["dailyReview"],
  PROCUREMENT_PRIORITY: ["dailyReview"],
  SUPPLIER_COMPARISON: ["dailyReview"],
  CROSS_DOMAIN_ANALYSIS: ["dailyReview"],
  FORECAST: ["forecast"],
  SCENARIO: ["scenario"],
  PROCUREMENT_RFQ: ["procurementRfq"],
  PURCHASE_ORDER: ["purchaseOrder"],
  SUPPLIER_PERFORMANCE: ["supplierPerformance"],
  EXECUTIVE_REPORT: ["report"],
  UNSUPPORTED: [],
};

export function createIntent(
  intent: AIIntentName,
  partial?: Partial<Pick<AIIntent, "confidence" | "entities" | "timeRange">>
): AIIntent {
  return {
    intent,
    confidence: partial?.confidence ?? 1,
    entities: partial?.entities ?? [],
    timeRange: partial?.timeRange ?? DEFAULT_TIME_RANGE,
    requiredContext: INTENT_CONTEXT[intent],
  };
}
