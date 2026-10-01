/**
 * Development/demo adapter only.
 * Demonstrates Question → Intent → Context → Structured Response
 * using existing dashboard + Phase 5A mock replies.
 *
 * Not wired to the AI Assistant UI. Not a real model or backend.
 */

import { INTENT_TOOLS, type BusinessContext } from "@/lib/ai/context";
import { detectIntent } from "@/lib/ai/detect-intent";
import type { AIIntent } from "@/lib/ai/intents";
import type { AIProvider } from "@/lib/ai/provider";
import type { AIActionContract, AIFollowUp, AIInsightContract, StructuredAIResponse } from "@/lib/ai/response";
import { DEFAULT_TIME_RANGE } from "@/lib/ai/types";
import { resolveAIResponse, type AIResponse as MockUIResponse } from "@/lib/mock/ai";
import {
  attentionItems,
  dashboardMetrics,
  productPerformance,
  regionalPerformance,
  salesPerformance,
} from "@/lib/mock/dashboard";
import { getTenant } from "@/lib/tenant";

const metric = (id: string) => dashboardMetrics.find((item) => item.id === id)!;

function buildDemoContext(intent: AIIntent): BusinessContext {
  const tenant = getTenant();
  const toolsUsed = INTENT_TOOLS[intent.intent];
  const context: BusinessContext = {
    dataMode: "demonstration",
    tenantId: tenant.id,
    tenantBrand: tenant.brand,
    timeRange: intent.timeRange,
    slices: intent.requiredContext,
    toolsUsed,
  };

  if (intent.requiredContext.includes("executiveMetrics")) {
    context.executiveMetrics = {
      revenue: metric("revenue").value,
      revenueTrend: metric("revenue").trend,
      orders: metric("orders").value,
      ordersTrend: metric("orders").trend,
      rfqs: metric("rfqs").value,
      rfqsTrend: metric("rfqs").trend,
      customers: metric("customers").value,
      customersTrend: metric("customers").trend,
      demand: metric("demand").value,
      timeRange: DEFAULT_TIME_RANGE,
    };
  }

  if (intent.requiredContext.includes("salesPerformance")) {
    context.salesPerformance = {
      timeRange: DEFAULT_TIME_RANGE,
      points: salesPerformance["30D"],
    };
  }

  if (intent.requiredContext.includes("products")) {
    const wanted = intent.entities.find((e) => e.kind === "product")?.id;
    const rows = wanted ? productPerformance.filter((row) => row.id === wanted) : productPerformance.slice(0, 3);
    context.products = rows.map((row) => ({
      product: row.product,
      form: row.form,
      orders: row.orders,
      demand: row.demand,
      growth: row.growth,
      trend: row.growthUp ? "up" : "down",
      status: row.status,
    }));
  }

  if (intent.requiredContext.includes("customers")) {
    context.customers = {
      activeCustomers: metric("customers").value,
      inactiveHighValueCount: 3,
      inactiveWindowDays: 45,
      openRfqAccount: "ABC Pharmaceuticals",
      overdueQuote: "QT-1842",
    };
  }

  if (intent.requiredContext.includes("rfqs")) {
    const amox = productPerformance.find((row) => row.id === "amox")!;
    const uganda = regionalPerformance.find((row) => row.id === "ug")!;
    context.rfqs = {
      count: metric("rfqs").value,
      trend: metric("rfqs").trend,
      demandProduct: amox.product,
      demandGrowth: amox.growth,
      growingRegion: uganda.country,
      regionGrowth: uganda.growth,
    };
  }

  if (intent.requiredContext.includes("regionalPerformance")) {
    const wanted = intent.entities.find((e) => e.kind === "region")?.id;
    const rows = wanted ? regionalPerformance.filter((row) => row.id === wanted) : regionalPerformance.slice(0, 2);
    context.regionalPerformance = rows.map((row) => ({
      country: row.country,
      revenue: row.revenue,
      growth: row.growth,
      activity: row.activity,
    }));
  }

  if (intent.requiredContext.includes("opportunities")) {
    context.opportunities = [
      {
        id: "op3",
        category: "Region",
        insight: "Uganda distributor activity is growing faster than the regional average.",
        action: "Review the regional sales opportunity.",
      },
    ];
  }

  if (intent.requiredContext.includes("attentionItems")) {
    context.attentionItems = attentionItems.slice(0, 3).map((item) => ({
      id: item.id,
      severity: item.severity,
      title: item.title,
      detail: item.detail,
      meta: item.meta,
    }));
  }

  if (intent.requiredContext.includes("dailyReview")) {
    context.dailyReview = {
      health: [
        { domain: "Production", status: "ATTENTION", hint: "At-risk orders" },
        { domain: "Materials", status: "CRITICAL", hint: "Shortages" },
        { domain: "Procurement", status: "ATTENTION", hint: "Pending review" },
      ],
      attention: [
        {
          severity: "CRITICAL",
          domain: "materials",
          title: "Material shortage",
          summary: "Projected shortage after inbound.",
          reason: "Affects production due dates.",
        },
      ],
      metrics: {
        productionAtRisk: 1,
        materialShortages: 1,
        pendingRequisitions: 1,
        supplierGaps: 0,
        inventoryCritical: 0,
        openAttention: 1,
      },
    };
  }

  if (intent.requiredContext.includes("forecast")) {
    context.forecast = {
      horizon: "Next 30 days",
      sales: {
        currentValue: "KSh 100K",
        projectedValue: "KSh 100K",
        direction: "stable",
        growth: "—",
        confidence: "LOW",
        explanation: "Demo forecast packet only.",
      },
      rfq: {
        currentValue: "2",
        projectedValue: "2",
        direction: "stable",
        growth: "—",
        confidence: "LOW",
        explanation: "Demo forecast packet only.",
      },
      production: {
        currentValue: "1",
        projectedValue: "1",
        direction: "unknown",
        growth: "—",
        confidence: "LOW",
        explanation: "Demo forecast packet only.",
      },
      materials: {
        currentValue: "1",
        projectedValue: "1",
        direction: "unknown",
        growth: "—",
        confidence: "LOW",
        explanation: "Demo forecast packet only.",
      },
      procurement: {
        currentValue: "0",
        projectedValue: "0",
        direction: "stable",
        growth: "—",
        confidence: "INSUFFICIENT",
        explanation: "Insufficient historical data",
      },
      inventory: {
        currentValue: "0",
        projectedValue: "0",
        direction: "stable",
        growth: "—",
        confidence: "LOW",
        explanation: "Demo forecast packet only.",
      },
      risks: [{ domain: "materials", title: "Material watch", severity: "MEDIUM", reason: "Demo only." }],
    };
  }

  if (intent.requiredContext.includes("scenario")) {
    context.scenario = {
      simulation: "SIMULATED",
      horizon: "Next 30 days",
      inputs: {
        horizon: 30,
        demandChangePct: 20,
        productionCapacityChangePct: 0,
        productionDelayDays: 0,
        inventoryAvailabilityChangePct: 0,
        procurementAvailabilityChangePct: 0,
        priorityMode: "current",
      },
      assumptions: [{ label: "Demand", change: "+20%", supported: true }],
      comparison: [{ label: "Production orders", current: "24", scenario: "29", variance: "+5" }],
      journey: [{ stage: "Demand", metric: "Pipeline pressure", reason: "Simulated surge", confidence: "MEDIUM" }],
      impactChain: [{ trigger: "+20% demand", consequence: "Material requirement increases" }],
      decision: {
        headline: "Higher capacity required",
        why: ["Capacity reaches 94%"],
        tradeOffs: ["Higher utilization"],
        limitations: ["Demo only"],
      },
      impacts: [
        {
          domain: "sales",
          metric: "Revenue outlook",
          baseline: "KSh 100K",
          projected: "KSh 120K",
          delta: "+20.0%",
          severity: "LOW",
        },
      ],
      risks: [{ title: "Simulated demand pressure", severity: "MEDIUM", impact: "Demo only." }],
      excludedDomains: [],
    };
  }

  if (intent.requiredContext.includes("report")) {
    context.report = {
      view: "executive",
      revenue: "KSh 0",
      revenueGrowth: "—",
      productionAtRisk: 0,
      expiredQty: "0",
      materialShortages: 0,
      procurementOpen: "—",
      supplierAttention: 0,
      signals: [],
      limitedData: ["Demo report packet only."],
    };
  }

  return context;
}

function actionKind(href: string): AIActionContract["kind"] {
  if (href.startsWith("/products")) return "VIEW_PRODUCT";
  if (href.startsWith("/customers")) return "VIEW_CUSTOMER";
  if (href.startsWith("/analytics")) return "VIEW_REGION";
  if (href.startsWith("/rfqs")) return "VIEW_RFQ";
  if (href.startsWith("/dashboard")) return "VIEW_SALES";
  if (href.startsWith("/quotes")) return "REVIEW_ATTENTION";
  return "INVESTIGATE_OPPORTUNITY";
}

function mapActions(mock: MockUIResponse): AIActionContract[] {
  return mock.actions.map((action) => ({
    kind: actionKind(action.href),
    label: action.label,
    href: action.href,
  }));
}

function insightCategory(label: string): AIInsightContract["category"] {
  if (/rfq/i.test(label)) return "RFQ_SIGNAL";
  if (/demand|amoxicillin|product/i.test(label)) return "DEMAND_SIGNAL";
  if (/uganda|kenya|region/i.test(label)) return "REGIONAL_SIGNAL";
  if (/customer|account/i.test(label)) return "CUSTOMER_SIGNAL";
  if (/revenue|order/i.test(label)) return "SALES_SIGNAL";
  return "ATTENTION";
}

function mapInsights(mock: MockUIResponse): AIInsightContract[] {
  return (mock.insights ?? []).map((insight) => ({
    category: insightCategory(insight.label),
    title: insight.label,
    metric: insight.value,
    trend: insight.delta,
    entity: insight.value,
  }));
}

function mapFollowUps(mock: MockUIResponse): AIFollowUp[] {
  return mock.followUps.map((question) => ({ question }));
}

function toStructured(
  intent: AIIntent,
  context: BusinessContext,
  mock: MockUIResponse,
  question: string
): StructuredAIResponse {
  const targetName = context.customers?.openRfqAccount ?? "ABC Pharmaceuticals";
  const proposedWorkflowDraft =
    intent.intent === "ATTENTION_ITEMS"
      ? {
          type: "CUSTOMER_REENGAGEMENT",
          title: "Re-engage inactive accounts",
          reason: "Customers in the current period need follow-up attention.",
          targetName,
        }
      : intent.intent === "RFQ_ANALYSIS"
        ? {
            type: "RFQ_FOLLOW_UP",
            title: "Follow up on RFQ activity",
            reason: "RFQ activity increased and may warrant customer follow-up.",
            targetName,
          }
        : intent.intent === "OPPORTUNITY_ANALYSIS"
          ? {
              type: "SALES_OPPORTUNITY_FOLLOW_UP",
              title: "Follow up on open opportunities",
              reason: "Open sales opportunities should be reviewed with the account.",
              targetName,
            }
          : undefined;

  const wantsDraft = /\b(draft|prepare a follow-up|prepare a message|write a follow-up)\b/i.test(question);
  const proposedCommunicationDraft = wantsDraft
    ? {
        type:
          intent.intent === "RFQ_ANALYSIS"
            ? "RFQ_FOLLOW_UP"
            : intent.intent === "OPPORTUNITY_ANALYSIS"
              ? "SALES_OPPORTUNITY_FOLLOW_UP"
              : intent.intent === "ATTENTION_ITEMS"
                ? "CUSTOMER_REENGAGEMENT"
                : "CUSTOMER_FOLLOW_UP",
        targetName,
        subject: `Follow-up with ${targetName}`,
        body: `Hello,\n\nI am writing from Laboratory & Allied regarding a commercial follow-up with ${targetName}. Please let us know a convenient time to continue the discussion.\n\nKind regards`,
        reason: "Workspace data indicates this account may need a concise commercial follow-up.",
      }
    : undefined;

  return {
    summary: mock.summary,
    keySignals: mock.signals,
    recommendedActions: [mock.recommendation],
    followUps: mapFollowUps(mock),
    insights: mapInsights(mock),
    actions: mapActions(mock),
    proposedWorkflowDraft: wantsDraft ? undefined : proposedWorkflowDraft,
    proposedCommunicationDraft,
    metadata: {
      intent: intent.intent,
      dataMode: context.dataMode,
      timeRange: context.timeRange,
      toolsUsed: context.toolsUsed,
      sources: ["Demonstration dashboard data"],
    },
  };
}

/** Demo orchestrator. Do not call from production UI in this phase. */
export function runDemoOrchestrator(question: string): {
  intent: AIIntent;
  context: BusinessContext;
  response: StructuredAIResponse;
} {
  const intent = detectIntent(question);
  const context = buildDemoContext(intent);
  const { response: mock } = resolveAIResponse(question);
  return { intent, context, response: toStructured(intent, context, mock, question) };
}

/** Satisfies AIProvider using demonstration data only — not a model. */
export const demoAIProvider: AIProvider = {
  id: "none",
  async generateResponse({ question }) {
    return runDemoOrchestrator(question).response;
  },
};
