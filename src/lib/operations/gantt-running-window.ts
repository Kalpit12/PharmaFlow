/** Running op geometry: actual START → max(now, planned end). Never a future-only bar. */

export function runningBarWindow(input: {
  openStartAt: Date | null | undefined;
  plannedStart: Date;
  plannedEnd: Date;
  now: Date;
}): { start: Date; end: Date } {
  if (!input.openStartAt) {
    return { start: input.plannedStart, end: input.plannedEnd };
  }
  const start = input.openStartAt.getTime() > input.now.getTime() ? input.now : input.openStartAt;
  const endMs = Math.max(input.now.getTime(), input.plannedEnd.getTime(), start.getTime() + 60_000);
  return { start, end: new Date(endMs) };
}

export function countRunningOpsByWorkstation(
  rows: Array<{ workstationId: string | null; isRunning: boolean }>,
  parallelCapacityByWorkstation: Map<string, number>
): Array<{ workstationId: string; running: number; allowed: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.isRunning || !row.workstationId) continue;
    counts.set(row.workstationId, (counts.get(row.workstationId) ?? 0) + 1);
  }
  const violations: Array<{ workstationId: string; running: number; allowed: number }> = [];
  for (const [workstationId, running] of counts) {
    const allowed = Math.max(1, parallelCapacityByWorkstation.get(workstationId) ?? 1);
    if (running > allowed) violations.push({ workstationId, running, allowed });
  }
  return violations;
}
