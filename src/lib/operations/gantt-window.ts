import {
  formatGanttDayHeaderCaps,
  formatGanttDayLabel,
  formatGanttTimeLabel,
} from "@/lib/operations/gantt-format";

export type GanttZoom = "8h" | "day" | "week" | "month" | "quarter";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function startOfLocalDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function resolveGanttWindow(input?: {
  zoom?: string | null;
  start?: string | null;
  end?: string | null;
  now?: Date;
}): { start: Date; end: Date; zoom: GanttZoom } {
  const now = input?.now ?? new Date();
  const zoom: GanttZoom =
    input?.zoom === "8h" ||
    input?.zoom === "day" ||
    input?.zoom === "week" ||
    input?.zoom === "month" ||
    input?.zoom === "quarter"
      ? input.zoom
      : "day";

  let start: Date;
  if (input?.start) {
    start = new Date(`${input.start}T00:00:00.000Z`);
  } else if (zoom === "day" && !input?.end) {
    start = new Date(now.getTime() - 6 * HOUR_MS);
  } else {
    start = startOfLocalDay(now);
  }
  if (Number.isNaN(start.getTime())) start = startOfLocalDay(now);

  if (input?.end) {
    const end = new Date(`${input.end}T23:59:59.999Z`);
    if (!Number.isNaN(end.getTime()) && end.getTime() > start.getTime()) {
      return { start, end, zoom };
    }
  }

  const end = new Date(start.getTime());
  if (zoom === "8h") end.setTime(start.getTime() + 8 * HOUR_MS);
  else if (zoom === "day") end.setTime(start.getTime() + 36 * HOUR_MS);
  else if (zoom === "week") end.setTime(start.getTime() + 7 * DAY_MS);
  else if (zoom === "month") end.setTime(start.getTime() + 30 * DAY_MS);
  else end.setTime(start.getTime() + 90 * DAY_MS);

  return { start, end, zoom };
}

export type GanttTick = { at: string; label: string; subLabel?: string };

export type GanttHeaderDay = { start: string; end: string; label: string };
export type GanttHeaderHour = { at: string; label: string };

export function buildGanttHeaderTiers(
  start: Date,
  end: Date,
  zoom: GanttZoom
): { days: GanttHeaderDay[]; hours: GanttHeaderHour[] } {
  const days: GanttHeaderDay[] = [];
  const hours: GanttHeaderHour[] = [];
  let dayCursor = startOfLocalDay(start);
  while (dayCursor.getTime() < end.getTime()) {
    const dayEnd = new Date(Math.min(end.getTime(), dayCursor.getTime() + DAY_MS));
    days.push({
      start: dayCursor.toISOString(),
      end: dayEnd.toISOString(),
      label: formatGanttDayHeaderCaps(dayCursor),
    });
    dayCursor = new Date(dayCursor.getTime() + DAY_MS);
  }

  const hourStepMs =
    zoom === "8h"
      ? 30 * 60_000
      : zoom === "day"
        ? 2 * HOUR_MS
        : zoom === "week"
          ? 12 * HOUR_MS
          : 24 * HOUR_MS;

  if (zoom === "week") {
    let dayCursor = startOfLocalDay(start);
    while (dayCursor.getTime() < end.getTime()) {
      for (const minuteOfDay of [0, 12 * 60]) {
        const at = new Date(dayCursor.getTime() + minuteOfDay * 60_000);
        if (at.getTime() >= start.getTime() && at.getTime() < end.getTime()) {
          hours.push({ at: at.toISOString(), label: formatGanttTimeLabel(at) });
        }
      }
      dayCursor = new Date(dayCursor.getTime() + DAY_MS);
    }
  } else {
    let hourCursor = new Date(start);
    while (hourCursor.getTime() < end.getTime()) {
      hours.push({
        at: hourCursor.toISOString(),
        label: formatGanttTimeLabel(hourCursor),
      });
      hourCursor = new Date(hourCursor.getTime() + hourStepMs);
    }
  }

  return { days, hours };
}

/** Drop hour labels closer than minSpacingPx on a timeline of timelineWidthPx. */
export function filterHeaderHoursBySpacing(
  hours: GanttHeaderHour[],
  start: Date,
  end: Date,
  timelineWidthPx: number,
  minSpacingPx = 48
): GanttHeaderHour[] {
  if (hours.length === 0 || timelineWidthPx <= 0) return hours;
  const span = end.getTime() - start.getTime();
  const kept: GanttHeaderHour[] = [];
  let lastPx = -Infinity;
  for (const hour of hours) {
    const t = new Date(hour.at).getTime();
    const px = ((t - start.getTime()) / span) * timelineWidthPx;
    if (kept.length === 0 || px - lastPx >= minSpacingPx) {
      kept.push(hour);
      lastPx = px;
    }
  }
  return kept;
}

export function buildGanttTicks(start: Date, end: Date, zoom: GanttZoom): GanttTick[] {
  const ticks: GanttTick[] = [];
  const span = end.getTime() - start.getTime();
  if (span <= 0) return ticks;

  if (zoom === "8h" || zoom === "day") {
    const cursor = new Date(start);
    while (cursor.getTime() < end.getTime()) {
      ticks.push({
        at: cursor.toISOString(),
        label: formatGanttTimeLabel(cursor),
        subLabel: cursor.getUTCHours() === 0 ? formatGanttDayLabel(cursor) : undefined,
      });
      cursor.setTime(cursor.getTime() + (zoom === "8h" ? HOUR_MS : 6 * HOUR_MS));
    }
    return ticks;
  }

  const cursor = new Date(start);
  const stepDays = zoom === "week" ? 1 : zoom === "month" ? 2 : 7;
  while (cursor.getTime() < end.getTime()) {
    ticks.push({
      at: cursor.toISOString(),
      label: formatGanttDayLabel(cursor),
    });
    cursor.setUTCDate(cursor.getUTCDate() + stepDays);
  }
  return ticks;
}
