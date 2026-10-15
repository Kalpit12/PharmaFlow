import { intervalsForDay, type WorkCalendar } from "@/lib/operations/calendar";
import { addPlantDays, atPlantMinute, startOfPlantDay } from "@/lib/operations/plant-time";

export type GanttOffShiftBlock = {
  id: string;
  workstationId: string;
  start: string;
  end: string;
};

/** Working shift windows (SkyPlanner-style green availability bands). */
export function buildOnShiftBlocks(
  windowStart: Date,
  windowEnd: Date,
  workstationId: string,
  calendar: WorkCalendar
): GanttOffShiftBlock[] {
  const blocks: GanttOffShiftBlock[] = [];
  let day = startOfPlantDay(windowStart);
  while (day.getTime() < windowEnd.getTime()) {
    for (const interval of intervalsForDay(day, calendar)) {
      const start = atPlantMinute(day, interval.startMinute);
      const end = atPlantMinute(day, interval.endMinute);
      if (end.getTime() <= windowStart.getTime() || start.getTime() >= windowEnd.getTime()) continue;
      blocks.push({
        id: `shift-${workstationId}-${start.toISOString()}`,
        workstationId,
        start: new Date(Math.max(start.getTime(), windowStart.getTime())).toISOString(),
        end: new Date(Math.min(end.getTime(), windowEnd.getTime())).toISOString(),
      });
    }
    day = addPlantDays(day, 1);
  }
  return blocks;
}

/** Complement of working intervals within each plant day (for grey non-shift shading). */
export function buildOffShiftBlocks(
  windowStart: Date,
  windowEnd: Date,
  workstationId: string,
  calendar: WorkCalendar
): GanttOffShiftBlock[] {
  const blocks: GanttOffShiftBlock[] = [];
  let day = startOfPlantDay(windowStart);
  while (day.getTime() < windowEnd.getTime()) {
    const working = intervalsForDay(day, calendar);
    const gaps: Array<{ startMinute: number; endMinute: number }> = [];
    let cursor = 0;
    for (const interval of working) {
      if (interval.startMinute > cursor) gaps.push({ startMinute: cursor, endMinute: interval.startMinute });
      cursor = Math.max(cursor, interval.endMinute);
    }
    if (cursor < 1_440) gaps.push({ startMinute: cursor, endMinute: 1_440 });

    for (const gap of gaps) {
      const start = atPlantMinute(day, gap.startMinute);
      const end = atPlantMinute(day, gap.endMinute);
      if (end.getTime() <= windowStart.getTime() || start.getTime() >= windowEnd.getTime()) continue;
      blocks.push({
        id: `${workstationId}-${start.toISOString()}`,
        workstationId,
        start: new Date(Math.max(start.getTime(), windowStart.getTime())).toISOString(),
        end: new Date(Math.min(end.getTime(), windowEnd.getTime())).toISOString(),
      });
    }
    day = addPlantDays(day, 1);
  }
  return blocks;
}
