/** Plant wall clock for Gantt “Now” (MediCrest Nairobi site). */
export const GANTT_PLANT_TIME_ZONE = "Africa/Nairobi";

export function formatGanttNowLabel(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: GANTT_PLANT_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("weekday")} ${pick("day")} ${pick("month")}, ${pick("hour")}:${pick("minute")}`;
}
