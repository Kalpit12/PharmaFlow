export function ganttMsFromLeftPct(leftPct: number, windowStart: Date, windowEnd: Date): number {
  const span = windowEnd.getTime() - windowStart.getTime();
  return windowStart.getTime() + (leftPct / 100) * span;
}

export function ganttLeftPctFromTime(at: Date, windowStart: Date, windowEnd: Date): number {
  const span = windowEnd.getTime() - windowStart.getTime();
  if (span <= 0) return 0;
  return ((at.getTime() - windowStart.getTime()) / span) * 100;
}

export function ganttBarLayout(
  startIso: string,
  endIso: string,
  windowStart: Date,
  windowEnd: Date
): { leftPct: number; widthPct: number } | null {
  const ws = windowStart.getTime();
  const we = windowEnd.getTime();
  const span = we - ws;
  if (span <= 0) return null;
  const start = Math.max(ws, new Date(startIso).getTime());
  const end = Math.min(we, new Date(endIso).getTime());
  if (end <= start) return null;
  return {
    leftPct: ((start - ws) / span) * 100,
    widthPct: ((end - start) / span) * 100,
  };
}
