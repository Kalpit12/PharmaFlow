import type { ActionProposal } from "@/lib/ai/actions";
import type { CommunicationDraftView } from "@/lib/ai/communications";
import type { WorkflowProposal } from "@/lib/ai/workflows";
import {
  attentionItems,
  dashboardMetrics,
  productPerformance,
  regionalPerformance,
  salesPerformance,
} from "@/lib/mock/dashboard";

export type AIInsight = {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
};

export type AIAction = {
  label: string;
  href: string;
};

export type AIResponse = {
  summary: string;
  signals: string[];
  recommendation: string;
  insights?: AIInsight[];
  sparkline?: number[];
  sparklineLabel?: string;
  actions: AIAction[];
  followUps: string[];
  actionProposal?: ActionProposal;
  workflowProposal?: WorkflowProposal;
  communicationDraft?: CommunicationDraftView;
};

const metric = (id: string) => dashboardMetrics.find((item) => item.id === id)!;
const product = (id: string) => productPerformance.find((item) => item.id === id)!;
const region = (id: string) => regionalPerformance.find((item) => item.id === id)!;

const revenue = metric("revenue");
const orders = metric("orders");
const rfqs = metric("rfqs");
const customers = metric("customers");
const demand = metric("demand");
const amox = product("amox");
const ferro = product("ferro");
const para = product("para");
const uganda = region("ug");
const kenya = region("ke");

export const starterQuestions = [
  "What needs my attention today?",
  "What is the biggest operational risk right now?",
  "Which procurement requisitions should I review first?",
  "Why are RFQs increasing?",
  "Which customers should I follow up with?",
  "Give me today's business summary.",
];

export const aiResponses: Record<string, AIResponse> = {
  "why are rfqs increasing": {
    summary: `RFQ activity is up ${rfqs.trend} over the last 30 days, with ${rfqs.value} requests in the current period.`,
    signals: [
      "Increased distributor enquiries, including a new enquiry from Uganda this morning.",
      `Higher demand for ${amox.product} (${amox.growth} commercial growth).`,
      `${uganda.country} activity is growing ${uganda.growth}, faster than several neighbouring markets.`,
    ],
    recommendation:
      "Review Amoxicillin inventory coverage and Uganda distributor demand before the next production cycle.",
    insights: [
      { label: "RFQ activity", value: rfqs.value, delta: rfqs.trend },
      { label: "Demand signal", value: amox.product, delta: amox.growth },
      { label: "Regional signal", value: uganda.country, delta: uganda.growth },
    ],
    actions: [
      { label: "Investigate RFQs", href: "/rfqs" },
      { label: "View Amoxicillin", href: "/products" },
      { label: "View Uganda", href: "/analytics" },
    ],
    followUps: [
      "Which products are driving RFQ growth?",
      "Which customers submitted the most RFQs?",
      "Show me the regional breakdown.",
    ],
  },
  "which products need attention": {
    summary: `${amox.product} and ${ferro.product} are carrying the commercial load. ${para.product} is the watch item.`,
    signals: [
      `${amox.product}: ${amox.orders} orders, demand ${amox.demand.toLowerCase()}, growth ${amox.growth}.`,
      `${ferro.product}: ${ferro.orders} orders, growth ${ferro.growth}.`,
      `${para.product}: ${para.orders} orders, growth ${para.growth} — status Watch.`,
    ],
    recommendation: `Protect supply for ${amox.product} and review why ${para.product} demand has softened.`,
    insights: [
      { label: amox.product, value: amox.orders, delta: amox.growth },
      { label: ferro.product, value: ferro.orders, delta: ferro.growth },
      { label: para.product, value: para.orders, delta: para.growth, positive: para.growthUp },
    ],
    actions: [
      { label: "Review products", href: "/products" },
      { label: "Review documents", href: "/documents" },
    ],
    followUps: [
      "How is Amoxicillin performing?",
      "Why are RFQs increasing?",
      "Give me today's business summary.",
    ],
  },
  "which customers should i follow up with": {
    summary:
      "Three high-value customers have not placed an order in the last 45 days, and quotation QT-1842 is two days overdue.",
    signals: [
      attentionItems[3].detail,
      `${attentionItems[0].title}: ${attentionItems[0].detail} (${attentionItems[0].meta}).`,
      `${attentionItems[1].title}: ${attentionItems[1].detail}.`,
    ],
    recommendation: "Prioritize targeted commercial follow-up this week, starting with the overdue quotation and the 45-day inactive accounts.",
    insights: [
      { label: "Customer signal", value: "3 accounts", delta: "45+ days" },
      { label: "Open RFQ", value: "ABC Pharmaceuticals", delta: "2,000 units" },
      { label: "Overdue quote", value: "QT-1842", delta: "2 days" },
    ],
    actions: [
      { label: "Review customers", href: "/customers" },
      { label: "Review quotation", href: "/quotes" },
    ],
    followUps: [
      "Why are RFQs increasing?",
      "Give me today's business summary.",
      "Which products need attention?",
    ],
  },
  "how is amoxicillin performing": {
    summary: `${amox.product} is the strongest commercial product in the current demonstration set.`,
    signals: [
      `${amox.orders} orders with ${amox.demand.toLowerCase()} demand.`,
      `Growth ${amox.growth} versus the prior period — status ${amox.status}.`,
      "Demand signal: enquiry volume is rising across active customers and distributors.",
    ],
    recommendation: "Review inventory cover and distributor demand before the next production cycle.",
    insights: [
      { label: "Demand", value: amox.orders, delta: amox.growth },
      { label: "Status", value: amox.status },
      { label: "Form", value: amox.form },
    ],
    sparkline: salesPerformance["30D"].map((point) => point.rfqs),
    sparklineLabel: "RFQ activity (weekly index, demonstration)",
    actions: [
      { label: "Review product", href: "/products" },
      { label: "Investigate RFQs", href: "/rfqs" },
    ],
    followUps: [
      "Why are RFQs increasing?",
      "Which products need attention?",
      "What opportunities do you see in Uganda?",
    ],
  },
  "what opportunities do you see in uganda": {
    summary: `${uganda.country} distributor activity is growing ${uganda.growth}, faster than the regional average, on ${uganda.revenue} in demonstration revenue.`,
    signals: [
      `${kenya.country} remains the largest market at ${kenya.revenue} (${kenya.growth}).`,
      `${uganda.country} is classified ${uganda.activity.toLowerCase()} with outsized growth versus size.`,
      "A new distributor enquiry from Uganda was logged this morning.",
    ],
    recommendation: "Review the regional sales opportunity and confirm Amoxicillin supply for Ugandan distributors.",
    insights: [
      { label: "Regional signal", value: uganda.country, delta: uganda.growth },
      { label: "Revenue", value: uganda.revenue },
      { label: "Kenya (anchor)", value: kenya.revenue, delta: kenya.growth },
    ],
    actions: [
      { label: "View region", href: "/analytics" },
      { label: "View Amoxicillin", href: "/products" },
    ],
    followUps: [
      "Show me the regional breakdown.",
      "How is Amoxicillin performing?",
      "Give me today's business summary.",
    ],
  },
  "give me today's business summary": {
    summary: `Demonstration performance: revenue ${revenue.value} (${revenue.trend}), orders ${orders.value} (${orders.trend}), RFQs ${rfqs.value} (${rfqs.trend}).`,
    signals: [
      `Active customers ${customers.value} (${customers.trend}). Product demand ${demand.value}.`,
      `${amox.product} leads product activity at ${amox.growth}.`,
      "Needs attention: ABC Pharmaceuticals RFQ (2,000 units) and quotation QT-1842 overdue.",
    ],
    recommendation: "Start with the high-priority RFQ and the Amoxicillin demand signal, then schedule follow-up for the three inactive high-value accounts.",
    insights: [
      { label: revenue.label, value: revenue.value, delta: revenue.trend },
      { label: rfqs.label, value: rfqs.value, delta: rfqs.trend },
      { label: "Product demand", value: demand.value },
    ],
    actions: [
      { label: "Review RFQ", href: "/rfqs" },
      { label: "Open dashboard", href: "/dashboard" },
    ],
    followUps: [
      "Why are RFQs increasing?",
      "Which customers should I follow up with?",
      "Which products need attention?",
    ],
  },
  "which products are driving rfq growth": {
    summary: `${amox.product} is the primary driver of RFQ growth, with ${ferro.product} contributing secondary demand.`,
    signals: [
      `${amox.product}: ${amox.growth} growth and ${amox.orders} orders.`,
      `${ferro.product}: ${ferro.growth} on maternal-health demand.`,
      `Overall RFQ activity ${rfqs.trend} on ${rfqs.value} requests.`,
    ],
    recommendation: `Focus commercial and supply planning on ${amox.product}, then confirm Ferrous-Folic cover.`,
    insights: [
      { label: amox.product, value: amox.orders, delta: amox.growth },
      { label: ferro.product, value: ferro.orders, delta: ferro.growth },
    ],
    actions: [
      { label: "View products", href: "/products" },
      { label: "Investigate RFQs", href: "/rfqs" },
    ],
    followUps: ["How is Amoxicillin performing?", "Which products need attention?"],
  },
  "which customers submitted the most rfqs": {
    summary: "ABC Pharmaceuticals is the most urgent RFQ account in the current demonstration set.",
    signals: [
      "ABC Pharmaceuticals requested 2,000 units of Amoxicillin — received 18 minutes ago.",
      "XYZ Healthcare confirmed an order this morning and accepted a quotation earlier.",
      "Three high-value accounts remain inactive for 45+ days and should not be confused with RFQ volume.",
    ],
    recommendation: "Qualify the ABC Pharmaceuticals RFQ immediately, then separate inactive-account follow-up from inbound RFQ work.",
    actions: [
      { label: "Review RFQ", href: "/rfqs" },
      { label: "Review customers", href: "/customers" },
    ],
    followUps: ["Which customers should I follow up with?", "How is Amoxicillin performing?"],
  },
  "show me the regional breakdown": {
    summary: `${kenya.country} accounts for ${kenya.revenue}. ${uganda.country} is the fastest-growing market at ${uganda.growth}.`,
    signals: regionalPerformance.map(
      (row) => `${row.country}: ${row.revenue}, ${row.growth}, ${row.activity.toLowerCase()} activity.`
    ),
    recommendation: `Protect the ${kenya.country} base and investigate the ${uganda.country} growth opportunity.`,
    insights: [
      { label: kenya.country, value: kenya.revenue, delta: kenya.growth },
      { label: uganda.country, value: uganda.revenue, delta: uganda.growth },
    ],
    actions: [{ label: "View region", href: "/analytics" }],
    followUps: ["What opportunities do you see in Uganda?", "Give me today's business summary."],
  },
};

export const fallbackResponse: AIResponse = {
  summary:
    "I can help analyze Pharmaflow's current business data, including sales, RFQs, products, customers and regional activity.",
  signals: [
    "Ask about RFQ growth, product attention, customer follow-up, Amoxicillin, Uganda, or today's summary.",
    "Answers use demonstration data only — not live commercial figures.",
  ],
  recommendation: "Choose a suggested question to stay within the current demonstration set.",
  actions: [{ label: "Open dashboard", href: "/dashboard" }],
  followUps: starterQuestions.slice(0, 3),
};

export function normalizeQuestion(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[?.!]+$/g, "");
}

export function resolveAIResponse(input: string): { matched: boolean; response: AIResponse } {
  const key = normalizeQuestion(input);
  const response = aiResponses[key];
  if (response) return { matched: true, response };
  return { matched: false, response: fallbackResponse };
}
