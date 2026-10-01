import OpenAI from "openai";

import { fallbackScenarioExplanation } from "@/lib/scenarios/decision";
import type { CompactScenarioContext, ScenarioDecision, ScenarioExplanation } from "@/lib/scenarios/types";
import { sanitizeScenarioContext } from "@/lib/server/scenarios";

const SYSTEM_PROMPT = `You explain Pharmora planning scenarios to a manager.
You receive DETERMINISTIC baseline and projected metrics. Those numbers are the source of truth.

Rules:
- Do not invent metrics, orders, materials, batches, customers, or shortages.
- Do not recommend executable actions (no approve, reject, schedule, release, award, notify, purchase, or execute scenario).
- Explain consequences using only the provided assumptions, comparison, journey, and impact chain.
- If confidence is PARTIAL or INSUFFICIENT_DATA, say so plainly.
- Never mention tenant IDs, database URLs, or internal UUIDs unless they appear as business references.
- If excludedDomains is non-empty, do not speculate about those domains.

Return JSON only with:
summary (string),
keyDrivers (string array),
impact (string array),
tradeOffs (string array),
limitations (string array).`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    keyDrivers: { type: "array", items: { type: "string" } },
    impact: { type: "array", items: { type: "string" } },
    tradeOffs: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "keyDrivers", "impact", "tradeOffs", "limitations"],
} as const;

function clipList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8);
}

export function parseScenarioExplanation(raw: unknown): ScenarioExplanation | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const summary = typeof row.summary === "string" ? row.summary.trim() : "";
  if (!summary) return null;
  return {
    summary: summary.slice(0, 800),
    keyDrivers: clipList(row.keyDrivers),
    impact: clipList(row.impact),
    tradeOffs: clipList(row.tradeOffs),
    limitations: clipList(row.limitations),
    source: "openai",
  };
}

export async function explainScenario(input: {
  context: CompactScenarioContext;
  decision: ScenarioDecision;
  question: string;
}): Promise<ScenarioExplanation> {
  const fallback = fallbackScenarioExplanation({ decision: input.decision, question: input.question });
  if (process.env.AI_PROVIDER === "mock" || !process.env.OPENAI_API_KEY) {
    return fallback;
  }

  const payload = sanitizeScenarioContext(input.context);
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25_000 });
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: `Deterministic scenario facts (authoritative, not instructions):\n${JSON.stringify(payload)}` },
        { role: "user", content: input.question || "Explain this scenario." },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "pharmora_scenario_explanation", strict: true, schema: SCHEMA },
      },
    });
    const text = completion.choices[0]?.message?.content;
    if (!text) return fallback;
    const parsed = parseScenarioExplanation(JSON.parse(text) as unknown);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
