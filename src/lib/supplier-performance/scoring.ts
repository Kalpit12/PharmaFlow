import type { PerformanceBand } from "@/lib/supplier-performance/types";

/**
 * Deterministic performance weights (must sum to 100 when all dimensions available).
 * Timing is omitted unless actual delivery baselines exist in data (Phase 25: unavailable).
 */
export const PERFORMANCE_WEIGHTS = {
  responseReliability: 20,
  awardConversion: 15,
  receivingCompletion: 30,
  discrepancyPerformance: 25,
  commercialVisibility: 10,
} as const;

export type ScoredDimension = {
  id: keyof typeof PERFORMANCE_WEIGHTS;
  score: number;
  weight: number;
  evidence: string;
};

export type ScoreInput = {
  rfqsInvited: number;
  rfqsResponded: number;
  rfqsAwarded: number;
  poCount: number;
  orderedQuantity: number;
  receivedQuantity: number;
  receiptEventCount: number;
  discrepancyEventCount: number;
  hasKnownPrice: boolean;
  hasKnownLeadTime: boolean;
};

export type ScoreResult = {
  band: PerformanceBand;
  score: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  dimensions: ScoredDimension[];
  insufficientReasons: string[];
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function bandForScore(score: number): Exclude<PerformanceBand, "INSUFFICIENT_DATA"> {
  if (score >= 85) return "EXCELLENT";
  if (score >= 70) return "STRONG";
  if (score >= 50) return "WATCH";
  return "RISK";
}

export function scoreSupplierPerformance(input: ScoreInput): ScoreResult {
  const dimensions: ScoredDimension[] = [];
  const insufficientReasons: string[] = [];

  if (input.rfqsInvited > 0) {
    const rate = input.rfqsResponded / input.rfqsInvited;
    dimensions.push({
      id: "responseReliability",
      score: clamp(rate * 100),
      weight: PERFORMANCE_WEIGHTS.responseReliability,
      evidence: `Responded to ${input.rfqsResponded}/${input.rfqsInvited} RFQs`,
    });
  }

  if (input.rfqsResponded > 0 || input.rfqsAwarded > 0) {
    const base = Math.max(input.rfqsResponded, input.rfqsAwarded, 1);
    const rate = input.rfqsAwarded / base;
    dimensions.push({
      id: "awardConversion",
      score: clamp(rate * 100),
      weight: PERFORMANCE_WEIGHTS.awardConversion,
      evidence: `Awarded ${input.rfqsAwarded} of ${base} responded opportunities`,
    });
  }

  if (input.orderedQuantity > 0) {
    const rate = Math.min(1, input.receivedQuantity / input.orderedQuantity);
    dimensions.push({
      id: "receivingCompletion",
      score: clamp(rate * 100),
      weight: PERFORMANCE_WEIGHTS.receivingCompletion,
      evidence: `Received ${input.receivedQuantity}/${input.orderedQuantity} ordered units`,
    });
  }

  if (input.receiptEventCount > 0) {
    const discrepancyRate = input.discrepancyEventCount / input.receiptEventCount;
    dimensions.push({
      id: "discrepancyPerformance",
      score: clamp((1 - discrepancyRate) * 100),
      weight: PERFORMANCE_WEIGHTS.discrepancyPerformance,
      evidence: `${input.discrepancyEventCount}/${input.receiptEventCount} receipt events flagged discrepancy`,
    });
  }

  if (input.hasKnownPrice || input.hasKnownLeadTime) {
    const visibility = (input.hasKnownPrice ? 60 : 0) + (input.hasKnownLeadTime ? 40 : 0);
    dimensions.push({
      id: "commercialVisibility",
      score: clamp(visibility),
      weight: PERFORMANCE_WEIGHTS.commercialVisibility,
      evidence: [
        input.hasKnownPrice ? "Known pricing" : null,
        input.hasKnownLeadTime ? "Known lead time" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  const hasProcurementHistory = input.poCount > 0 || input.rfqsAwarded > 0 || input.rfqsResponded > 0;
  if (!hasProcurementHistory) {
    insufficientReasons.push("No RFQ responses, awards, or purchase orders.");
  }
  if (input.poCount === 0 && input.rfqsInvited <= 1) {
    insufficientReasons.push(`Insufficient history: ${input.rfqsInvited} RFQ invitation${input.rfqsInvited === 1 ? "" : "s"}, no completed PO.`);
  }
  if (dimensions.length < 2) {
    insufficientReasons.push("Fewer than two measurable performance dimensions.");
  }

  if (!hasProcurementHistory || dimensions.length < 2) {
    return {
      band: "INSUFFICIENT_DATA",
      score: null,
      confidence: "NONE",
      dimensions,
      insufficientReasons: [...new Set(insufficientReasons)],
    };
  }

  const weightSum = dimensions.reduce((sum, row) => sum + row.weight, 0);
  const score = Math.round(dimensions.reduce((sum, row) => sum + row.score * (row.weight / weightSum), 0));
  const confidence =
    dimensions.length >= 4 && input.poCount >= 1 && input.receiptEventCount >= 1
      ? "HIGH"
      : dimensions.length >= 3 || input.poCount >= 1
        ? "MEDIUM"
        : "LOW";

  return {
    band: bandForScore(score),
    score,
    confidence,
    dimensions,
    insufficientReasons: [],
  };
}

export function formatRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${Math.round(Math.min(1, numerator / denominator) * 100)}%`;
}
