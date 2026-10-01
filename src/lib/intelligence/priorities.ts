import type { IntelligenceSeverity, OperationalInsight, OperationalPriority } from "@/lib/intelligence/types";

const SEVERITY_SCORE: Record<IntelligenceSeverity, number> = {
  CRITICAL: 40,
  HIGH: 25,
  MEDIUM: 12,
  LOW: 4,
};

export function rankOperationalPriorities(insights: OperationalInsight[]): OperationalPriority[] {
  const scored = insights.map((insight) => scoreInsight(insight));
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return scored.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function bandPriorities(priorities: OperationalPriority[]) {
  return {
    critical: priorities.filter((row) => row.band === "CRITICAL"),
    high: priorities.filter((row) => row.band === "HIGH"),
    watch: priorities.filter((row) => row.band === "MEDIUM" || row.band === "LOW"),
  };
}

function scoreInsight(insight: OperationalInsight): Omit<OperationalPriority, "rank"> {
  const reasons: string[] = [`Severity ${insight.severity} (${SEVERITY_SCORE[insight.severity]})`];
  let score = SEVERITY_SCORE[insight.severity];

  if (insight.relatedDomains.includes("production")) {
    score += 12;
    reasons.push("Production impact (+12)");
  }
  if (insight.relatedDomains.includes("quality") || insight.domain === "quality") {
    score += 10;
    reasons.push("Quality impact (+10)");
  }
  if (insight.source.includes("material shortage") || insight.relatedDomains.includes("materials")) {
    score += 8;
    reasons.push("Material cover (+8)");
  }
  if (/overdue/i.test(insight.what) || /overdue/i.test(insight.why)) {
    score += 10;
    reasons.push("Overdue state (+10)");
  }
  if (insight.relatedDomains.includes("commercial") || insight.relatedDomains.includes("traceability")) {
    score += 6;
    reasons.push("Potential customer/order exposure (+6, partial)");
  }
  if (insight.confidence === "INSUFFICIENT_DATA") {
    score -= 8;
    reasons.push("Insufficient data (−8)");
  }

  let band: IntelligenceSeverity = "LOW";
  if (score >= 50 || insight.severity === "CRITICAL") band = "CRITICAL";
  else if (score >= 32 || insight.severity === "HIGH") band = "HIGH";
  else if (score >= 16) band = "MEDIUM";

  return {
    id: `pri-${insight.id}`,
    band,
    score,
    scoreReasons: reasons,
    insightId: insight.id,
    title: insight.what,
    reason: insight.why,
    impact: insight.impact,
    domain: insight.domain,
    relatedDomains: insight.relatedDomains,
    confidence: insight.confidence,
    href: insight.href,
  };
}

export function fallbackExplanation(priorities: OperationalPriority[], question: string) {
  const top = priorities.slice(0, 5);
  if (top.length === 0) {
    return {
      summary: "No ranked operational priorities are currently supported by recorded facts.",
      reasons: ["Deterministic intelligence found no production, material, quality, or procurement exceptions in authorized domains."],
      impacts: ["Nothing requires management attention from the current operational graph."],
      reviewItems: ["Confirm domain filters and permissions if you expected signals."],
      limitations: ["AI was not used. This explanation is the deterministic fallback."],
      source: "deterministic" as const,
    };
  }
  return {
    summary:
      top.length === 1
        ? top[0]!.title
        : `${top[0]!.title} is the highest-ranked operational priority (${top.length} ranked items).`,
    reasons: top.map((row) => `${row.band}: ${row.reason}`),
    impacts: top.map((row) => row.impact),
    reviewItems: top.map((row) => `${row.domain} → ${row.href}`),
    limitations: [
      question.trim() ? `Answered from deterministic facts for: ${question.slice(0, 160)}` : "Answered from deterministic ranked facts.",
      "AI explanation was not available; no figures were invented.",
      ...top
        .filter((row) => row.confidence !== "KNOWN")
        .map((row) => `${row.title}: ${row.confidence.replace(/_/g, " ").toLowerCase()}.`),
    ],
    source: "deterministic" as const,
  };
}
