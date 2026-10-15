import { PLANT_TIME_ZONE } from "@/lib/operations/plant-time";

/** Fixed locale so Gantt SSR and client hydration match. */
const GANTT_LOCALE = "en-GB";
const GANTT_TIME_ZONE = PLANT_TIME_ZONE;

export function formatGanttDayLabel(date: Date): string {
  return date.toLocaleDateString(GANTT_LOCALE, {
    month: "short",
    day: "numeric",
    timeZone: GANTT_TIME_ZONE,
  });
}

/** Two-tier Gantt header, e.g. "THU 15 OCT" */
export function formatGanttDayHeaderCaps(date: Date): string {
  return date
    .toLocaleDateString(GANTT_LOCALE, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: GANTT_TIME_ZONE,
    })
    .toUpperCase();
}

export function formatGanttTimeLabel(date: Date): string {
  return date.toLocaleTimeString(GANTT_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: GANTT_TIME_ZONE,
  });
}

export function formatGanttDateTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleString(GANTT_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: GANTT_TIME_ZONE,
  });
}

/** Tooltip / table: "Fri 16 Oct, 20:50" */
export function formatGanttDateTimeCompact(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat(GANTT_LOCALE, {
    timeZone: GANTT_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("weekday")} ${pick("day")} ${pick("month")}, ${pick("hour")}:${pick("minute")}`;
}

export function formatGanttDateOnly(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString(GANTT_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: GANTT_TIME_ZONE,
  });
}

export function formatOperationStatusLabel(status: string): string {
  const map: Record<string, string> = {
    SCHEDULED: "Scheduled",
    IN_PROGRESS: "In progress",
    PAUSED: "Paused",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };
  return map[status] ?? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
