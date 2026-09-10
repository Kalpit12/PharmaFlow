import { percentChangeCount } from "@/lib/server/money";
import type {
  ForecastConfidence,
  ForecastDirection,
  ForecastHorizonDays,
  ForecastMetric,
} from "@/lib/forecasting/types";

export function parseForecastHorizon(value?: string | null): ForecastHorizonDays {
  const raw = (value ?? "").trim();
  if (raw === "14" || raw === "14D" || /\b14\b/.test(raw)) return 14;
  if (raw === "7" || raw === "7D" || /\b7\b/.test(raw)) return 7;
  return 30;
}

export function horizonLabel(days: ForecastHorizonDays): string {
  return `Next ${days} days`;
}

export function operationsWeeksForHorizon(days: ForecastHorizonDays): "1" | "2" | "4" {
  if (days === 7) return "1";
  if (days === 14) return "2";
  return "4";
}

export function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const ms = due.getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}

export function periodComparison(current: number, prior: number): { growth: string; direction: ForecastDirection } {
  if (prior === 0) {
    return { growth: "—", direction: current === 0 ? "stable" : "unknown" };
  }
  const change = percentChangeCount(current, prior);
  if (change.text === "—") return { growth: "—", direction: "unknown" };
  const abs = Math.abs(current - prior) / prior;
  if (abs < 0.03) return { growth: change.text, direction: "stable" };
  return { growth: change.text, direction: change.up ? "up" : "down" };
}

export function forecastConfidence(input: { dataPoints: number; current: number; prior: number }): ForecastConfidence {
  const { dataPoints, current, prior } = input;
  if (dataPoints < 1) return "INSUFFICIENT";
  if (current === 0 && prior === 0) return "LOW";
  if (prior === 0 || dataPoints < 2) return "LOW";
  if (dataPoints >= 4 && prior > 0) return "HIGH";
  return "MEDIUM";
}

/**
 * Near-term outlook from recent vs prior rolling windows.
 * INSUFFICIENT → null. Prior zero → current run-rate only (no invented growth).
 * Otherwise a 70/30 simple moving blend of recent and prior.
 */
export function projectRunRate(current: number, prior: number, confidence: ForecastConfidence): number | null {
  if (confidence === "INSUFFICIENT") return null;
  if (prior <= 0) return roundQty(current);
  return roundQty(current * 0.7 + prior * 0.3);
}

export function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

export function buildMetric(input: {
  metric: string;
  current: number;
  prior: number;
  dataPoints: number;
  format: (value: number) => string;
  period: string;
  explanation: string;
}): ForecastMetric {
  const { growth, direction } = periodComparison(input.current, input.prior);
  const confidence = forecastConfidence({
    dataPoints: input.dataPoints,
    current: input.current,
    prior: input.prior,
  });
  const projected = projectRunRate(input.current, input.prior, confidence);
  return {
    metric: input.metric,
    currentValue: input.format(input.current),
    projectedValue: projected === null ? null : input.format(projected),
    direction,
    growth,
    period: input.period,
    confidence,
    dataPoints: input.dataPoints,
    explanation:
      confidence === "INSUFFICIENT"
        ? "Insufficient historical data"
        : input.explanation,
  };
}

export function signalFromMetric(domain: string, metric: ForecastMetric): string | null {
  if (metric.confidence === "INSUFFICIENT") return null;
  if (metric.direction === "up") return `${domain} accelerating`;
  if (metric.direction === "down") return `${domain} softening`;
  if (metric.direction === "stable") return `${domain} stabilizing`;
  return `${domain} run-rate only (prior period was zero)`;
}
