import { intervalsForDay, type WorkCalendar } from "@/lib/operations/calendar";
import { addPlantDays, atPlantMinute, plantYmd, startOfPlantDay } from "@/lib/operations/plant-time";

export type GanttWorkSegment = { start: string; end: string };

/** Intersections of [rangeStart, rangeEnd] with shift windows — for split bar rendering. */
export function workingSegmentsInRange(
  rangeStart: Date,
  rangeEnd: Date,
  calendar: WorkCalendar
): GanttWorkSegment[] {
  if (rangeEnd.getTime() <= rangeStart.getTime()) return [];

  const segments: GanttWorkSegment[] = [];
  let day = startOfPlantDay(rangeStart);
  const lastDay = startOfPlantDay(rangeEnd);

  while (day.getTime() <= lastDay.getTime()) {
    const ymd = plantYmd(day);
    for (const interval of intervalsForDay(day, calendar)) {
      const segStart = atPlantMinute(day, interval.startMinute);
      const segEnd = atPlantMinute(day, interval.endMinute);
      const start = new Date(Math.max(rangeStart.getTime(), segStart.getTime()));
      const end = new Date(Math.min(rangeEnd.getTime(), segEnd.getTime()));
      if (end.getTime() > start.getTime()) {
        segments.push({ start: start.toISOString(), end: end.toISOString() });
      }
    }
    day = addPlantDays(day, 1);
    void ymd;
  }

  return segments;
}

export function formatDurationHuman(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours === 0) return `${rem}m`;
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}m`;
}

/** Short batch code for bar labels, e.g. BT-GANTT-01 → G-01. */
export function shortBatchLabel(batchNumber: string): string {
  if (/GANTT-20\d{2}/i.test(batchNumber)) {
    const stem = batchNumber.replace(/-GANTT-20\d{2}/i, "").replace(/-GANTT-\d+/i, "");
    if (stem.length > 0 && stem.length <= 12) return stem;
  }
  const gantt = batchNumber.match(/GANTT-(\d+)/i) ?? batchNumber.match(/DEMO-(\d+)/i);
  if (gantt) {
    const raw = gantt[1]!;
    if (!(raw.length === 4 && raw.startsWith("20"))) {
      return `G-${raw.padStart(2, "0").slice(-2)}`;
    }
  }
  const tail = batchNumber.match(/-(\d+)$/);
  if (tail) {
    const letter = (batchNumber.match(/BT-([A-Z]+)/i)?.[1]?.[0] ?? "B").toUpperCase();
    return `${letter}-${tail[1]!.padStart(2, "0")}`;
  }
  if (batchNumber.length <= 8) return batchNumber;
  return batchNumber.slice(0, 8);
}
