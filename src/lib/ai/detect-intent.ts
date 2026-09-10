import { createIntent, type AIIntent } from "@/lib/ai/intents";
import { DEFAULT_TIME_RANGE, type AIEntity, type TimeRange } from "@/lib/ai/types";
import { encodeScenarioInput, parseScenarioFromQuestion } from "@/lib/scenarios/engine";

function resolveTimeRange(q: string): TimeRange {
  if (/\b(14d|next 14|14 days)\b/.test(q)) return { preset: "30D", label: "14" };
  if (/\b(7d|this week|last week|past week|next 7)\b/.test(q)) return { preset: "7D", label: "last 7 days" };
  if (/\b(90d|quarter|this quarter|last quarter|3 months)\b/.test(q)) return { preset: "90D", label: "last 90 days" };
  if (/\b(12m|this year|last year|12 months)\b/.test(q)) return { preset: "12M", label: "last 12 months" };
  if (/\b(30d|last month|past month|30 days|next 30)\b/.test(q)) return { preset: "30D", label: "last 30 days" };
  return DEFAULT_TIME_RANGE;
}

export function detectIntent(question: string): AIIntent {
  const q = question.trim().toLowerCase();
  const entities: AIEntity[] = [];
  const timeRange = resolveTimeRange(q);

  if (/\bamoxicillin\b/.test(q)) entities.push({ kind: "product", value: "Amoxicillin" });
  if (/\bferrous|ferro-folic|folic\b/.test(q)) entities.push({ kind: "product", value: "Ferrous-Folic" });
  if (/\bazithromycin\b/.test(q)) entities.push({ kind: "product", value: "Azithromycin" });
  if (/\bparacetamol\b/.test(q)) entities.push({ kind: "product", value: "Paracetamol" });
  if (/\bmetronidazole\b/.test(q)) entities.push({ kind: "product", value: "Metronidazole" });
  if (/\buganda\b/.test(q)) entities.push({ kind: "region", value: "Uganda" });
  if (/\bkenya\b/.test(q)) entities.push({ kind: "region", value: "Kenya" });
  if (/\btanzania\b/.test(q)) entities.push({ kind: "region", value: "Tanzania" });
  if (entities.some((e) => e.kind === "timeRange") === false && timeRange.preset !== "30D") {
    entities.push({ kind: "timeRange", value: timeRange.preset });
  }

  if (/\babc\b/.test(q)) entities.push({ kind: "customer", value: "ABC Pharmaceuticals" });

  if (
    /\b(weather|joke|recipe|sports score)\b/.test(q) ||
    /\b(diagnos|dosage|prescribe|treatment plan|medical advice|patient)\b/.test(q)
  ) {
    return createIntent("UNSUPPORTED", { confidence: 0.95, entities, timeRange });
  }

  if (
    /\b(explain this report|explain the report|explain this executive report|explain the executive report)\b/.test(q)
  ) {
    return createIntent("EXECUTIVE_REPORT", { confidence: 0.96, entities, timeRange });
  }

  if (
    /\b(explain this purchase order|explain the purchase order|analyze purchase order)\b/.test(q) ||
    /purchase-order:[a-f0-9-]+/i.test(question)
  ) {
    const idMatch = question.match(/purchase-order:([a-f0-9-]+)/i);
    return createIntent("PURCHASE_ORDER", {
      confidence: 0.95,
      entities: idMatch?.[1] ? [{ kind: "rfq", id: idMatch[1], value: "Purchase order" }] : entities,
      timeRange: { preset: "30D", label: idMatch?.[1] ? `purchase-order:${idMatch[1]}` : undefined },
    });
  }

  if (/\b(explain supplier performance|supplier performance|which suppliers (are|need)|supplier scorecard)\b/.test(q)) {
    return createIntent("SUPPLIER_PERFORMANCE", { confidence: 0.93, entities, timeRange });
  }

  if (
    /\b(analyze rfq|explain supplier comparison)\b/.test(q) ||
    /procurement-rfq:[a-f0-9-]+/i.test(question)
  ) {
    const idMatch = question.match(/procurement-rfq:([a-f0-9-]+)/i);
    return createIntent("PROCUREMENT_RFQ", {
      confidence: 0.95,
      entities: idMatch?.[1] ? [{ kind: "rfq", id: idMatch[1], value: "Procurement RFQ" }] : entities,
      timeRange: { preset: "30D", label: idMatch?.[1] ? `procurement-rfq:${idMatch[1]}` : undefined },
    });
  }

  if (
    /\b(explain this scenario|explain the scenario|scenario planning|what-if|what happens if)\b/.test(q)
  ) {
    const scenario = parseScenarioFromQuestion(q);
    return createIntent("SCENARIO", {
      confidence: 0.95,
      entities,
      timeRange: {
        preset: scenario.horizon === 7 ? "7D" : "30D",
        label: encodeScenarioInput(scenario),
      },
    });
  }
  if (
    /\b(explain this forecast|explain the forecast|what is likely to happen|near[- ]term (outlook|forecast)|decision intelligence|forecast)\b/.test(
      q
    )
  ) {
    return createIntent("FORECAST", { confidence: 0.95, entities, timeRange });
  }
  if (
    /\b(explain today'?s (priorities|situation)|what needs my attention today|prioritize today|biggest operational risk|daily (business )?review|what should i (do|prioritize) (first|today))\b/.test(
      q
    )
  ) {
    return createIntent("DAILY_REVIEW", { confidence: 0.95, entities, timeRange });
  }
  if (/\b(sales and operations|cross[- ]domain|operations and procurement)\b/.test(q)) {
    return createIntent("CROSS_DOMAIN_ANALYSIS", { confidence: 0.9, entities, timeRange });
  }
  if (/\b(production orders? affected|material shortage|materials? risk|why is .+ a risk)\b/.test(q)) {
    return createIntent("MATERIAL_RISK", { confidence: 0.9, entities, timeRange });
  }
  if (/\b(procurement|requisition).*(first|review|priorit)/.test(q) || /\bwhich procurement\b/.test(q)) {
    return createIntent("PROCUREMENT_PRIORITY", { confidence: 0.9, entities, timeRange });
  }
  if (/\b(supplier options?|compare suppliers?|preferred supplier)\b/.test(q)) {
    return createIntent("SUPPLIER_COMPARISON", { confidence: 0.88, entities, timeRange });
  }
  if (/\b(operational (priority|risk)|production (risk|attention)|what is the biggest)\b/.test(q)) {
    return createIntent("OPERATIONAL_PRIORITY", { confidence: 0.88, entities, timeRange });
  }

  if (/\b(draft|prepare a follow-up|prepare a message|write a follow-up)\b/.test(q)) {
    if (/\brfqs?\b/.test(q)) return createIntent("RFQ_ANALYSIS", { confidence: 0.9, entities, timeRange });
    if (/\bopportunit/.test(q)) return createIntent("OPPORTUNITY_ANALYSIS", { confidence: 0.88, entities, timeRange });
    if (/\battention\b/.test(q)) return createIntent("ATTENTION_ITEMS", { confidence: 0.88, entities, timeRange });
    return createIntent("CUSTOMER_ACTIVITY", { confidence: 0.88, entities, timeRange });
  }
  if (/\bwho should i follow up\b/.test(q)) {
    return createIntent("ATTENTION_ITEMS", { confidence: 0.88, entities, timeRange });
  }
  if (/\brfqs?\b/.test(q) && /\b(customer|submitted|who)\b/.test(q)) {
    return createIntent("CUSTOMER_ACTIVITY", { confidence: 0.82, entities, timeRange });
  }
  if (/\brfqs?\b/.test(q)) return createIntent("RFQ_ANALYSIS", { confidence: 0.9, entities, timeRange });
  if (/\b(need attention|needs attention)\b/.test(q) && /\bproduct/.test(q)) {
    return createIntent("PRODUCT_PERFORMANCE", { confidence: 0.86, entities, timeRange });
  }
  if (/\b(need attention|needs attention|follow up|follow-up)\b/.test(q) && /\bcustomer/.test(q)) {
    return createIntent("ATTENTION_ITEMS", { confidence: 0.9, entities, timeRange });
  }
  if (/\battention\b/.test(q)) return createIntent("ATTENTION_ITEMS", { confidence: 0.85, entities, timeRange });
  if (/\b(amoxicillin|azithromycin|paracetamol|metronidazole|ferrous|product)\b/.test(q) && !/\bregion|uganda|kenya\b/.test(q)) {
    return createIntent("PRODUCT_PERFORMANCE", { confidence: 0.88, entities, timeRange });
  }
  if (/\bcustomer\b/.test(q)) return createIntent("CUSTOMER_ACTIVITY", { confidence: 0.86, entities, timeRange });
  if (/\b(uganda|kenya|tanzania|rwanda|region)\b/.test(q)) {
    return createIntent(/\bopportunit/.test(q) ? "OPPORTUNITY_ANALYSIS" : "REGIONAL_PERFORMANCE", {
      confidence: 0.88,
      entities,
      timeRange,
    });
  }
  if (/\bopportunit/.test(q)) return createIntent("OPPORTUNITY_ANALYSIS", { confidence: 0.8, entities, timeRange });
  if (/\b(revenue|sales)\b/.test(q)) return createIntent("SALES_PERFORMANCE", { confidence: 0.88, entities, timeRange });
  if (/\b(summary|how is the business|focus on today|today)\b/.test(q)) {
    return createIntent("BUSINESS_SUMMARY", { confidence: 0.85, entities, timeRange });
  }
  return createIntent("GENERAL_BUSINESS_QUERY", { confidence: 0.55, entities, timeRange });
}
