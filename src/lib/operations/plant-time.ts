/** MediCrest plant wall clock (Nairobi). Shifts and Gantt labels use this zone. */
export const PLANT_TIME_ZONE = "Africa/Nairobi";

/** YYYY-MM-DD in plant time zone. */
export function plantYmd(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PLANT_TIME_ZONE }).format(instant);
}

/** 0 = Sunday … 6 = Saturday in plant time. */
export function plantWeekday(instant: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: PLANT_TIME_ZONE, weekday: "short" }).format(instant);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

export function plantMinuteOfDay(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PLANT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** UTC instant of 00:00 on the plant calendar day containing `instant`. (Kenya is UTC+3, no DST.) */
export function startOfPlantDay(instant: Date): Date {
  const ymd = plantYmd(instant);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, -3, 0, 0));
}

export function atPlantMinute(plantDayStart: Date, minuteOfDay: number): Date {
  return new Date(plantDayStart.getTime() + minuteOfDay * 60_000);
}

export function addPlantDays(plantDayStart: Date, days: number): Date {
  return new Date(plantDayStart.getTime() + days * 86_400_000);
}
