import type { AIIntent, AIIntentName } from "@/lib/ai/intents";
import type { AIToolName, ToolOutput } from "@/lib/ai/tools";
import type { ContextSlice, DataMode, TimeRange } from "@/lib/ai/types";

export type { ContextSlice };

export const INTENT_TOOLS: Record<AIIntentName, AIToolName[]> = {
  SALES_PERFORMANCE: ["get_sales_performance", "get_business_summary"],
  PRODUCT_PERFORMANCE: ["get_product_performance"],
  RFQ_ANALYSIS: ["get_rfq_analysis", "get_product_performance", "get_regional_performance"],
  CUSTOMER_ACTIVITY: ["get_customer_activity", "get_attention_items"],
  REGIONAL_PERFORMANCE: ["get_regional_performance"],
  BUSINESS_SUMMARY: ["get_business_summary", "get_attention_items", "get_opportunities"],
  OPPORTUNITY_ANALYSIS: ["get_opportunities", "get_regional_performance"],
  ATTENTION_ITEMS: ["get_attention_items"],
  GENERAL_BUSINESS_QUERY: ["get_business_summary"],
  DAILY_REVIEW: ["get_daily_review"],
  OPERATIONAL_PRIORITY: ["get_daily_review"],
  MATERIAL_RISK: ["get_daily_review"],
  PROCUREMENT_PRIORITY: ["get_daily_review"],
  SUPPLIER_COMPARISON: ["get_daily_review"],
  CROSS_DOMAIN_ANALYSIS: ["get_daily_review"],
  FORECAST: ["get_forecast"],
  SCENARIO: ["get_scenario"],
  PROCUREMENT_RFQ: ["get_procurement_rfq"],
  PURCHASE_ORDER: ["get_purchase_order"],
  SUPPLIER_PERFORMANCE: ["get_supplier_performance"],
  EXECUTIVE_REPORT: ["get_report"],
  UNSUPPORTED: [],
};

/**
 * Controlled packet for a future model. Never pass arbitrary app state.
 * Populate only slices listed on the intent.
 */
export type BusinessContext = {
  dataMode: DataMode;
  tenantId: string;
  tenantBrand: string;
  timeRange: TimeRange;
  slices: ContextSlice[];
  toolsUsed: AIToolName[];
  executiveMetrics?: ToolOutput["get_business_summary"];
  salesPerformance?: ToolOutput["get_sales_performance"];
  products?: ToolOutput["get_product_performance"][];
  customers?: ToolOutput["get_customer_activity"];
  rfqs?: ToolOutput["get_rfq_analysis"];
  regionalPerformance?: ToolOutput["get_regional_performance"][];
  opportunities?: ToolOutput["get_opportunities"][];
  attentionItems?: ToolOutput["get_attention_items"][];
  dailyReview?: ToolOutput["get_daily_review"];
  forecast?: ToolOutput["get_forecast"];
  scenario?: ToolOutput["get_scenario"];
  procurementRfq?: ToolOutput["get_procurement_rfq"];
  purchaseOrder?: ToolOutput["get_purchase_order"];
  supplierPerformance?: ToolOutput["get_supplier_performance"];
  report?: ToolOutput["get_report"];
};

export type ContextBuilderInput = {
  intent: AIIntent;
  tenantId: string;
  tenantBrand: string;
  dataMode: DataMode;
};

/**
 * Future Context Builder: intent → required tools → combined BusinessContext.
 * No execution in this phase.
 */
export type ContextBuilder = (input: ContextBuilderInput) => Promise<BusinessContext>;
