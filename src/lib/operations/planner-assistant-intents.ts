export type PlannerAssistantIntent =
  | "CREATE_FIRM_ORDER"
  | "CREATE_PROSPECT_ORDER"
  | "PROPOSE_RESCHEDULE_ALL"
  | "WORKSTATION_DOWNTIME"
  | "SUMMARY_AT_RISK"
  | "HELP";

export type ParsedPlannerAssistantMessage = {
  intent: PlannerAssistantIntent;
  confidence: number;
  productQuery: string | null;
  quantity: number | null;
  batchCount: number | null;
  customerQuery: string | null;
  dueInWeeks: number | null;
  dueDateIso: string | null;
  workstationQuery: string | null;
  downtimeDays: number | null;
};

function addWeeks(from: Date, weeks: number): string {
  const d = new Date(from.getTime() + weeks * 7 * 86_400_000);
  return d.toISOString();
}

function parseQuantity(text: string): number | null {
  const batchMatch = text.match(/(\d+)\s+batches?\b/i);
  if (batchMatch) return Number.parseInt(batchMatch[1], 10);
  const qtyMatch = text.match(/(\d[\d,]*)\s*(?:units|tablets|caps|doses|kg|batches)?/i);
  if (!qtyMatch) return null;
  return Number.parseInt(qtyMatch[1].replace(/,/g, ""), 10);
}

function parseProductQuery(text: string): string | null {
  const patterns = [
    /(?:batches?\s+of\s+)([a-z0-9][a-z0-9\s\-/]+?)(?:\s+for|\s+due|\s+in|\?|$)/i,
    /(?:order\s+for\s+)([a-z0-9][a-z0-9\s\-/]+?)(?:\s+for|\s+due|\s+in|\?|$)/i,
    /(amoxicillin[^?.,]*)/i,
    /(paracetamol[^?.,]*)/i,
    /(metronidazole[^?.,]*)/i,
    /sku[:\s]+([A-Z0-9-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function parseCustomerQuery(text: string): string | null {
  const match = text.match(/\bfor\s+(?:customer\s+)?([A-Za-z][A-Za-z0-9\s&.-]{2,40}?)(?:\s+due|\s+in|\?|$)/i);
  return match?.[1]?.trim() ?? null;
}

function parseWorkstationQuery(text: string): string | null {
  const codeMatch = text.match(/\b([A-Z]{2,4}-\d{1,2})\b/);
  if (codeMatch) return codeMatch[1];
  const nameMatch = text.match(/\b(compression\s*\d|granulator|blister|coater|fbd|blender)\b/i);
  return nameMatch?.[1] ?? null;
}

export function parsePlannerAssistantMessage(message: string, now = new Date()): ParsedPlannerAssistantMessage {
  const text = message.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return {
      intent: "HELP",
      confidence: 1,
      productQuery: null,
      quantity: null,
      batchCount: null,
      customerQuery: null,
      dueInWeeks: null,
      dueDateIso: null,
      workstationQuery: null,
      downtimeDays: null,
    };
  }

  if (/\b(at[- ]risk|late orders|what.+unscheduled|schedule health)\b/i.test(text)) {
    return {
      intent: "SUMMARY_AT_RISK",
      confidence: 0.9,
      productQuery: null,
      quantity: null,
      batchCount: null,
      customerQuery: null,
      dueInWeeks: null,
      dueDateIso: null,
      workstationQuery: null,
      downtimeDays: null,
    };
  }

  if (/\b(reschedule all|schedule unscheduled|run (the )?planner|re-?optimi[sz]e)\b/i.test(text)) {
    return {
      intent: "PROPOSE_RESCHEDULE_ALL",
      confidence: 0.92,
      productQuery: null,
      quantity: null,
      batchCount: null,
      customerQuery: null,
      dueInWeeks: null,
      dueDateIso: null,
      workstationQuery: null,
      downtimeDays: null,
    };
  }

  if (/\b(down|breakdown|offline|unavailable|maintenance)\b/i.test(text) && parseWorkstationQuery(text)) {
    const days = lower.includes("tomorrow") ? 1 : lower.match(/(\d+)\s+day/) ? Number.parseInt(lower.match(/(\d+)\s+day/)![1], 10) : 1;
    return {
      intent: "WORKSTATION_DOWNTIME",
      confidence: 0.88,
      productQuery: null,
      quantity: null,
      batchCount: null,
      customerQuery: null,
      dueInWeeks: null,
      dueDateIso: null,
      workstationQuery: parseWorkstationQuery(text),
      downtimeDays: days,
    };
  }

  if (/\b(create|add|new)\b.*\border\b/i.test(text) || /\bbatches?\s+of\b/i.test(text)) {
    const weeksMatch = lower.match(/(?:due\s+in|in)\s+(\d+)\s+weeks?/);
    const dueInWeeks = weeksMatch ? Number.parseInt(weeksMatch[1], 10) : 3;
    const batchCountMatch = lower.match(/(\d+)\s+batches?\s+of/i);
    const isProspect = /\b(prospect|quote|delivery date|what if we)\b/i.test(text);
    return {
      intent: isProspect ? "CREATE_PROSPECT_ORDER" : "CREATE_FIRM_ORDER",
      confidence: 0.85,
      productQuery: parseProductQuery(text),
      quantity: parseQuantity(text),
      batchCount: batchCountMatch ? Number.parseInt(batchCountMatch[1], 10) : null,
      customerQuery: parseCustomerQuery(text),
      dueInWeeks,
      dueDateIso: addWeeks(now, dueInWeeks),
      workstationQuery: null,
      downtimeDays: null,
    };
  }

  return {
    intent: "HELP",
    confidence: 0.5,
    productQuery: null,
    quantity: null,
    batchCount: null,
    customerQuery: null,
    dueInWeeks: null,
    dueDateIso: null,
    workstationQuery: null,
    downtimeDays: null,
  };
}

export const PLANNER_ASSISTANT_HELP = `I can draft planner actions for you to accept — nothing runs until you confirm.

Try:
• "Create an order for 20 batches of Amoxicillin 500 for customer Nairobi Distributors due in 3 weeks"
• "Schedule unscheduled jobs" / "Reschedule all"
• "What happens if CMP-2 is down tomorrow?"
• "Which orders are at risk?"`;
