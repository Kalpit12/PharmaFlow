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

export function computeScheduleAdherence(rows: ScheduleAdherenceInput[]): ScheduleAdherenceSummary {
  const completed = rows.filter(
    (row) => row.status === "COMPLETED" && row.plannedEnd && row.actualCompletion
  );
  if (completed.length === 0) {
    return { adherencePercent: null, onTimeCount: 0, lateCount: 0, sampleSize: 0 };
  }
  const onTime = completed.filter(
    (row) => row.actualCompletion!.getTime() <= row.plannedEnd!.getTime()
  );
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
