import { availableWorkingMinutes, type WorkCalendar } from "@/lib/operations/calendar";

export function scheduledOperationMinutesInWindow(
  operations: Array<{ workstationId: string | null; plannedStart: Date | null; plannedEnd: Date | null; changeoverMinutes?: number }>,
  workstationId: string,
  windowStart: Date,
  windowEnd: Date
): number {
  let total = 0;
  for (const op of operations) {
    if (op.workstationId !== workstationId || !op.plannedStart || !op.plannedEnd) continue;
    const start = Math.max(op.plannedStart.getTime(), windowStart.getTime());
    const end = Math.min(op.plannedEnd.getTime(), windowEnd.getTime());
    if (end <= start) continue;
    total += (end - start) / 60_000;
    if (op.changeoverMinutes) {
      const coStart = Math.max(op.plannedStart.getTime() - op.changeoverMinutes * 60_000, windowStart.getTime());
      const coEnd = Math.min(op.plannedStart.getTime(), windowEnd.getTime());
      if (coEnd > coStart) total += (coEnd - coStart) / 60_000;
    }
  }
  return total;
}

export function utilizationForWorkstation(
  scheduledMinutes: number,
  calendar: WorkCalendar,
  windowStart: Date,
  windowEnd: Date
): number {
  const available = availableWorkingMinutes(windowStart, windowEnd, calendar);
  if (available <= 0) return scheduledMinutes > 0 ? 100 : 0;
  return Math.round((scheduledMinutes / available) * 1000) / 10;
}

export function capacityStateFromLoad(loadPct: number): "OK" | "WARNING" | "DANGER" {
  if (loadPct >= 100) return "DANGER";
  if (loadPct >= 85) return "WARNING";
  return "OK";
}
