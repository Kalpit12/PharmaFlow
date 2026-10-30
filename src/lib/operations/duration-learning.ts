/**
 * Duration learning (spec Phase 3): compare logged run time with planned duration per routing step,
 * and suggest an updated `runMinutesPerBatch` once enough completed logs exist. Deterministic —
 * the planner (head planner role) accepts or ignores each suggestion; nothing changes automatically.
 */

export type TimelogEvent = { eventType: string; recordedAt: Date };

export type DurationSample = {
  operationId: string;
  routingOperationId: string;
  workstationId: string | null;
  plannedMinutes: number;
  events: TimelogEvent[];
};

export type RoutingStepRef = {
  id: string;
  code: string;
  name: string;
  productName: string;
  runMinutesPerBatch: number;
  isQcHold: boolean;
};

export type DurationSuggestion = {
  routingOperationId: string;
  stepCode: string;
  stepName: string;
  productName: string;
  currentRunMinutes: number;
  suggestedRunMinutes: number;
  medianRatio: number;
  sampleCount: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  byWorkstation: Array<{ workstationId: string | null; sampleCount: number; medianRatio: number }>;
};

export const DURATION_LEARNING_RULES = {
  minSamples: 3,
  /** Only suggest when logged time differs from plan by at least this fraction. */
  minDeviation: 0.1,
  /** Ratios outside this band are treated as logging mistakes (timer left running, tapped twice). */
  outlierLow: 0.2,
  outlierHigh: 5,
  roundToMinutes: 5,
  lookbackDays: 60,
} as const;

/** Logged running minutes = sum of START/RESUME → PAUSE/STOP intervals. Pauses are excluded. */
export function loggedRunMinutes(events: TimelogEvent[]): number | null {
  const sorted = [...events]
    .filter((row) => ["START", "RESUME", "PAUSE", "STOP"].includes(row.eventType))
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  let openedAt: number | null = null;
  let totalMs = 0;
  let closed = false;
  for (const row of sorted) {
    const t = row.recordedAt.getTime();
    if (row.eventType === "START" || row.eventType === "RESUME") {
      if (openedAt === null) openedAt = t;
    } else if (openedAt !== null) {
      totalMs += Math.max(0, t - openedAt);
      openedAt = null;
      if (row.eventType === "STOP") closed = true;
    }
  }
  if (!closed || totalMs <= 0) return null;
  return totalMs / 60_000;
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function roundMinutes(value: number): number {
  const step = DURATION_LEARNING_RULES.roundToMinutes;
  return Math.max(step, Math.round(value / step) * step);
}

function confidenceFor(n: number): DurationSuggestion["confidence"] {
  if (n >= 8) return "HIGH";
  if (n >= 5) return "MEDIUM";
  return "LOW";
}

export function buildDurationSuggestions(samples: DurationSample[], steps: RoutingStepRef[]): DurationSuggestion[] {
  const stepById = new Map(steps.map((row) => [row.id, row]));
  const ratios = new Map<string, Array<{ ratio: number; workstationId: string | null }>>();

  for (const sample of samples) {
    const step = stepById.get(sample.routingOperationId);
    if (!step || step.isQcHold || sample.plannedMinutes <= 0) continue;
    const logged = loggedRunMinutes(sample.events);
    if (logged === null) continue;
    const ratio = logged / sample.plannedMinutes;
    if (ratio < DURATION_LEARNING_RULES.outlierLow || ratio > DURATION_LEARNING_RULES.outlierHigh) continue;
    const list = ratios.get(step.id) ?? [];
    list.push({ ratio, workstationId: sample.workstationId });
    ratios.set(step.id, list);
  }

  const suggestions: DurationSuggestion[] = [];
  for (const [stepId, list] of ratios) {
    if (list.length < DURATION_LEARNING_RULES.minSamples) continue;
    const step = stepById.get(stepId)!;
    const medianRatio = median(list.map((row) => row.ratio));
    if (Math.abs(medianRatio - 1) < DURATION_LEARNING_RULES.minDeviation) continue;
    const suggestedRunMinutes = roundMinutes(step.runMinutesPerBatch * medianRatio);
    if (suggestedRunMinutes === step.runMinutesPerBatch) continue;

    const byWs = new Map<string | null, number[]>();
    for (const row of list) byWs.set(row.workstationId, [...(byWs.get(row.workstationId) ?? []), row.ratio]);

    suggestions.push({
      routingOperationId: step.id,
      stepCode: step.code,
      stepName: step.name,
      productName: step.productName,
      currentRunMinutes: step.runMinutesPerBatch,
      suggestedRunMinutes,
      medianRatio: Math.round(medianRatio * 100) / 100,
      sampleCount: list.length,
      confidence: confidenceFor(list.length),
      byWorkstation: [...byWs.entries()]
        .map(([workstationId, values]) => ({
          workstationId,
          sampleCount: values.length,
          medianRatio: Math.round(median(values) * 100) / 100,
        }))
        .sort((a, b) => b.sampleCount - a.sampleCount),
    });
  }

  return suggestions.sort(
    (a, b) => b.sampleCount * Math.abs(b.medianRatio - 1) - a.sampleCount * Math.abs(a.medianRatio - 1)
  );
}
