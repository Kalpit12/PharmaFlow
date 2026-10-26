export type ScheduleAdherenceInput = {
  plannedEnd: Date | null;
  actualCompletion: Date | null;
  status: string;
};

export type ScheduleAdherenceSummary = {
  adherencePercent: number | null;
  onTimeCount: number;
  lateCount: number;
  sampleSize: number;
};

/** Default ±30 minutes, or 10% of the planned window when both ends exist. */
export const SCHEDULE_ADHERENCE_TOLERANCE_MS = 30 * 60_000;

export function scheduleAdherenceToleranceMs(plannedStart: Date | null, plannedEnd: Date | null): number {
  if (plannedStart && plannedEnd) {
    const windowMs = plannedEnd.getTime() - plannedStart.getTime();
    if (windowMs > 0) return Math.max(SCHEDULE_ADHERENCE_TOLERANCE_MS, Math.round(windowMs * 0.1));
  }
  return SCHEDULE_ADHERENCE_TOLERANCE_MS;
}

export function computeScheduleAdherence(rows: ScheduleAdherenceInput[]): ScheduleAdherenceSummary {
  const completed = rows.filter(
    (row) => row.status === "COMPLETED" && row.plannedEnd && row.actualCompletion
  );
  if (completed.length === 0) {
    return { adherencePercent: null, onTimeCount: 0, lateCount: 0, sampleSize: 0 };
  }
  const onTime = completed.filter((row) => {
    const tolerance = scheduleAdherenceToleranceMs(null, row.plannedEnd);
    return row.actualCompletion!.getTime() <= row.plannedEnd!.getTime() + tolerance;
  });
  const lateCount = completed.length - onTime.length;
  return {
    adherencePercent: Math.round((onTime.length / completed.length) * 100),
    onTimeCount: onTime.length,
    lateCount,
    sampleSize: completed.length,
  };
}

export function computePlannerStability(input: {
  previousStarts: Map<string, number | null>;
  proposedStarts: Map<string, number | null>;
}): { movedOrders: number; totalComparable: number; stabilityPercent: number | null } {
  let moved = 0;
  let comparable = 0;
  for (const [orderId, previous] of input.previousStarts) {
    const proposed = input.proposedStarts.get(orderId);
    if (previous == null && proposed == null) continue;
    comparable += 1;
    if (previous !== proposed) moved += 1;
  }
  if (comparable === 0) return { movedOrders: 0, totalComparable: 0, stabilityPercent: null };
  const stable = comparable - moved;
  return {
    movedOrders: moved,
    totalComparable: comparable,
    stabilityPercent: Math.round((stable / comparable) * 100),
  };
}
