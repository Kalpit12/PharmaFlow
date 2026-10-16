export type WorkInterval = {
  startMinute: number;
  endMinute: number;
};

export type WorkCalendarException = {
  date: string;
  reason: string;
  intervals: WorkInterval[];
};

import {
  PLANT_TIME_ZONE,
  addPlantDays,
  atPlantMinute,
  plantMinuteOfDay,
  plantWeekday,
  plantYmd,
  startOfPlantDay,
} from "@/lib/operations/plant-time";

export type WorkCalendar = {
  label: string;
  timeZone: typeof PLANT_TIME_ZONE;
  weekly: Record<number, WorkInterval[]>;
  exceptions: WorkCalendarException[];
};

const DAY_MS = 86_400_000;

function isoDay(date: Date): string {
  return plantYmd(date);
}

function atMinute(dayAnchor: Date, minute: number): Date {
  return atPlantMinute(startOfPlantDay(dayAnchor), minute);
}

function normalizeIntervals(intervals: WorkInterval[]): WorkInterval[] {
  return intervals
    .filter((interval) => interval.startMinute >= 0 && interval.endMinute <= 1_440 && interval.endMinute > interval.startMinute)
    .slice()
    .sort((a, b) => a.startMinute - b.startMinute);
}

export type ShiftRecord = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type CalendarExceptionRecord = {
  date: string;
  reason: string;
  closed?: boolean;
  startMinute?: number | null;
  endMinute?: number | null;
  intervals?: WorkInterval[];
};

function clockLabelFromMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function weekdayLabel(weekly: Record<number, WorkInterval[]>): string {
  const working = [1, 2, 3, 4, 5, 6, 0].filter((day) => (weekly[day] ?? []).length > 0);
  const first = weekly[working[0] ?? 1]?.[0];
  const last = weekly[working[0] ?? 1]?.at(-1);
  const span =
    first && last
      ? `${clockLabelFromMinute(first.startMinute)}–${clockLabelFromMinute(last.endMinute)}`
      : "no shifts";
  if (working.length === 5 && working.every((day, index) => day === index + 1)) {
    return `Mon–Fri · ${span} EAT`;
  }
  if (working.length === 0) return "No working days";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${working.map((day) => names[day]).join(", ")} · ${span} EAT`;
}

export function createStandardWorkCalendar(capacityHoursPerDay: number): WorkCalendar {
  const endMinute = 8 * 60 + Math.max(0, capacityHoursPerDay) * 60;
  const shift = normalizeIntervals([{ startMinute: 8 * 60, endMinute: Math.min(1_440, endMinute) }]);
  return {
    label: `Mon–Fri · 08:00–${clockLabelFromMinute(Math.min(1_440, endMinute))} EAT`,
    timeZone: PLANT_TIME_ZONE,
    weekly: {
      0: [],
      1: shift,
      2: shift,
      3: shift,
      4: shift,
      5: shift,
      6: [],
    },
    exceptions: [],
  };
}

function exceptionIntervals(row: CalendarExceptionRecord): WorkInterval[] {
  if (row.intervals) return normalizeIntervals(row.intervals);
  if (row.closed !== false && (row.startMinute == null || row.endMinute == null)) return [];
  if (row.startMinute == null || row.endMinute == null) return [];
  return normalizeIntervals([{ startMinute: row.startMinute, endMinute: row.endMinute }]);
}

/**
 * Builds a workstation calendar from persisted shifts and dated exceptions.
 * Missing shifts fall back to the standard Mon–Fri capacity window.
 */
export function buildWorkCalendar(input: {
  capacityHoursPerDay: number;
  label?: string;
  shifts?: ShiftRecord[];
  exceptions?: CalendarExceptionRecord[];
}): WorkCalendar {
  const fallback = createStandardWorkCalendar(input.capacityHoursPerDay);
  const weekly: Record<number, WorkInterval[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };
  if (input.shifts && input.shifts.length > 0) {
    for (const shift of input.shifts) {
      if (shift.weekday < 0 || shift.weekday > 6) continue;
      weekly[shift.weekday] = normalizeIntervals([
        ...(weekly[shift.weekday] ?? []),
        { startMinute: shift.startMinute, endMinute: shift.endMinute },
      ]);
    }
  } else {
    Object.assign(weekly, fallback.weekly);
  }

  return {
    label: input.label ?? weekdayLabel(weekly),
    timeZone: PLANT_TIME_ZONE,
    weekly,
    exceptions: (input.exceptions ?? []).map((row) => ({
      date: row.date.slice(0, 10),
      reason: row.reason,
      intervals: exceptionIntervals(row),
    })),
  };
}

export function intervalsForDay(day: Date, calendar: WorkCalendar): WorkInterval[] {
  const exception = calendar.exceptions.find((row) => row.date === isoDay(day));
  return normalizeIntervals(exception ? exception.intervals : calendar.weekly[plantWeekday(day)] ?? []);
}

export function availableMinutesForDay(day: Date, calendar: WorkCalendar): number {
  return intervalsForDay(day, calendar).reduce((sum, interval) => sum + interval.endMinute - interval.startMinute, 0);
}

/** Average working hours per weekday (Mon–Fri) from shift template — for Cap h/d display. */
export function averageWeekdayCapacityHours(calendar: WorkCalendar): number {
  let total = 0;
  let days = 0;
  const anchor = startOfPlantDay(new Date());
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addPlantDays(anchor, offset);
    const wd = plantWeekday(day);
    if (wd >= 1 && wd <= 5) {
      total += availableMinutesForDay(day, calendar);
      days += 1;
    }
  }
  if (days === 0) return 0;
  return Math.round((total / days / 60) * 10) / 10;
}

export function isWorkingAt(date: Date, calendar: WorkCalendar): boolean {
  const minute = plantMinuteOfDay(date);
  return intervalsForDay(date, calendar).some(
    (interval) => minute >= interval.startMinute && minute < interval.endMinute
  );
}

export function alignToCalendar(from: Date, calendar: WorkCalendar): Date {
  let cursor = new Date(from);
  for (let searched = 0; searched < 370; searched += 1) {
    const intervals = intervalsForDay(cursor, calendar);
    for (const interval of intervals) {
      const start = atMinute(cursor, interval.startMinute);
      const end = atMinute(cursor, interval.endMinute);
      if (cursor.getTime() <= start.getTime()) return start;
      if (cursor.getTime() < end.getTime()) return cursor;
    }
    cursor = addPlantDays(startOfPlantDay(cursor), 1);
  }
  throw new Error("Work calendar has no available interval in the next 370 days.");
}

export function addWorkingMinutesOnCalendar(from: Date, minutes: number, calendar: WorkCalendar): Date {
  let remaining = Math.max(0, minutes);
  let cursor = alignToCalendar(from, calendar);
  while (remaining > 0) {
    const intervals = intervalsForDay(cursor, calendar);
    const active = intervals.find((interval) => {
      const start = atMinute(cursor, interval.startMinute).getTime();
      const end = atMinute(cursor, interval.endMinute).getTime();
      return cursor.getTime() >= start && cursor.getTime() < end;
    });
    if (!active) {
      cursor = alignToCalendar(addPlantDays(startOfPlantDay(cursor), 1), calendar);
      continue;
    }
    const end = atMinute(cursor, active.endMinute);
    const available = Math.max(0, (end.getTime() - cursor.getTime()) / 60_000);
    const take = Math.min(available, remaining);
    cursor = new Date(cursor.getTime() + take * 60_000);
    remaining -= take;
    if (remaining > 0) cursor = alignToCalendar(cursor, calendar);
  }
  return cursor;
}

export function availableWorkingMinutes(from: Date, to: Date, calendar: WorkCalendar): number {
  if (to.getTime() <= from.getTime()) return 0;
  let total = 0;
  for (
    let day = startOfPlantDay(from);
    day.getTime() < to.getTime();
    day = addPlantDays(day, 1)
  ) {
    for (const interval of intervalsForDay(day, calendar)) {
      const start = Math.max(from.getTime(), atMinute(day, interval.startMinute).getTime());
      const end = Math.min(to.getTime(), atMinute(day, interval.endMinute).getTime());
      total += Math.max(0, (end - start) / 60_000);
    }
  }
  return total;
}

export function workingMinutesByDay(from: Date, to: Date, calendar: WorkCalendar): Map<string, number> {
  const result = new Map<string, number>();
  if (to.getTime() <= from.getTime()) return result;
  for (
    let day = startOfPlantDay(from);
    day.getTime() < to.getTime();
    day = addPlantDays(day, 1)
  ) {
    let total = 0;
    for (const interval of intervalsForDay(day, calendar)) {
      const start = Math.max(from.getTime(), atMinute(day, interval.startMinute).getTime());
      const end = Math.min(to.getTime(), atMinute(day, interval.endMinute).getTime());
      total += Math.max(0, (end - start) / 60_000);
    }
    if (total > 0) result.set(isoDay(day), total);
  }
  return result;
}
