import type { AIIntentName } from "@/lib/ai/intents";
import type { AIActionContract, AIInsightContract, StructuredAIResponse } from "@/lib/ai/response";
import type { AIToolName } from "@/lib/ai/tools";
import type { DataMode, TimeRange } from "@/lib/ai/types";
import { parseModelCommunication } from "@/lib/ai/communications";
import { parseModelWorkflow } from "@/lib/ai/workflows";
import { parseModelAction } from "@/lib/server/actions";

const MAX_SUMMARY = 800;
const MAX_LIST = 8;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.slice(0, MAX_SUMMARY) : fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, MAX_LIST);
}

const CATEGORIES: AIInsightContract["category"][] = [
  "DEMAND_SIGNAL",
  "SALES_SIGNAL",
  "CUSTOMER_SIGNAL",
  "REGIONAL_SIGNAL",
  "RFQ_SIGNAL",
  "OPPORTUNITY",
  "RISK",
  "ATTENTION",
];

function parseInsights(value: unknown): AIInsightContract[] {
  if (!Array.isArray(value)) return [];
  const rows: AIInsightContract[] = [];
  for (const item of value.slice(0, MAX_LIST)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const category = CATEGORIES.includes(row.category as AIInsightContract["category"])
      ? (row.category as AIInsightContract["category"])
      : "ATTENTION";
    const title = asString(row.title);
    if (!title) continue;
    rows.push({
      category,
      title,
      description: asString(row.description) || undefined,
      metric: asString(row.metric) || undefined,
      trend: asString(row.trend) || undefined,
    });
  }
  return rows;
}

export function fallbackStructuredResponse(
  intent: AIIntentName,
  dataMode: DataMode,
  timeRange: TimeRange,
  toolsUsed: AIToolName[],
  summary: string
): StructuredAIResponse {
  return {
    summary,
    keySignals: [],
    recommendedActions: [],
    followUps: [],
    insights: [],
    actions: actionsForIntent(intent),
    metadata: {
      intent,
      dataMode,
      timeRange,
      toolsUsed,
      sources: dataMode === "demonstration" ? ["Demo workspace data"] : ["Workspace data"],
    },
  };
}

export function actionsForIntent(intent: AIIntentName): AIActionContract[] {
  switch (intent) {
    case "SALES_PERFORMANCE":
      return [{ kind: "VIEW_SALES", label: "View overview", href: "/dashboard" }];
    case "PRODUCT_PERFORMANCE":
      return [{ kind: "VIEW_PRODUCT", label: "View products", href: "/products" }];
    case "RFQ_ANALYSIS":
      return [{ kind: "VIEW_RFQ", label: "Review RFQs", href: "/rfqs" }];
    case "CUSTOMER_ACTIVITY":
    case "ATTENTION_ITEMS":
      return [{ kind: "VIEW_CUSTOMER", label: "Review customers", href: "/customers" }];
    case "REGIONAL_PERFORMANCE":
      return [{ kind: "VIEW_REGION", label: "View analytics", href: "/analytics" }];
    case "OPPORTUNITY_ANALYSIS":
      return [{ kind: "INVESTIGATE_OPPORTUNITY", label: "Review opportunities", href: "/analytics" }];
    case "DAILY_REVIEW":
    case "OPERATIONAL_PRIORITY":
    case "CROSS_DOMAIN_ANALYSIS":
      return [
        { kind: "REVIEW_ATTENTION", label: "Open daily review", href: "/daily-review" },
        { kind: "VIEW_SALES", label: "Open operations", href: "/operations" },
      ];
    case "MATERIAL_RISK":
      return [{ kind: "REVIEW_ATTENTION", label: "Review materials", href: "/materials" }];
    case "PROCUREMENT_PRIORITY":
      return [{ kind: "REVIEW_ATTENTION", label: "Review procurement", href: "/procurement" }];
    case "SUPPLIER_COMPARISON":
      return [{ kind: "REVIEW_ATTENTION", label: "Compare suppliers", href: "/supplier-performance" }];
    case "FORECAST":
      return [{ kind: "REVIEW_ATTENTION", label: "Open forecast", href: "/forecast" }];
    case "SCENARIO":
      return [{ kind: "REVIEW_ATTENTION", label: "Open scenario planning", href: "/scenarios" }];
    case "PROCUREMENT_RFQ":
      return [{ kind: "VIEW_RFQ", label: "Open RFQ management", href: "/rfqs" }];
    case "PURCHASE_ORDER":
      return [{ kind: "VIEW_RFQ", label: "Open purchase orders", href: "/purchase-orders" }];
    case "SUPPLIER_PERFORMANCE":
      return [{ kind: "REVIEW_ATTENTION", label: "Open supplier performance", href: "/supplier-performance" }];
    case "EXECUTIVE_REPORT":
      return [{ kind: "REVIEW_ATTENTION", label: "Open reports", href: "/reports" }];
    default:
      return [{ kind: "VIEW_SALES", label: "View overview", href: "/dashboard" }];
  }
}

export function parseStructuredResponse(
  raw: unknown,
  intent: AIIntentName,
  dataMode: DataMode,
  timeRange: TimeRange,
  toolsUsed: AIToolName[]
): StructuredAIResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const summary = asString(row.summary).trim();
  if (!summary) return null;
  const followUps = stringList(row.followUps).map((question) => ({ question }));
  return {
    summary,
    keySignals: stringList(row.keySignals),
    recommendedActions: stringList(row.recommendedActions),
    followUps,
    insights: parseInsights(row.insights),
    actions: actionsForIntent(intent),
    proposedActionDraft: parseModelAction(row.action) ?? undefined,
    proposedWorkflowDraft: parseModelWorkflow(row.workflow) ?? undefined,
    proposedCommunicationDraft: parseModelCommunication(row.communication) ?? undefined,
    metadata: {
      intent,
      dataMode,
      timeRange,
      toolsUsed,
      sources: dataMode === "demonstration" ? ["Demo workspace data"] : ["Workspace data"],
    },
  };
}
