import type { WorkInterval } from "@/lib/operations/calendar";

/**
 * A calendar exception stores the *available* interval for a plant day (one interval max).
 * When a breakdown takes a station down from `downFrom` to `downTo` (minutes of that plant day),
 * keep only the working time after the station comes back. Time before `downFrom` is already
 * in the past for the engine, so dropping it does not lose schedulable capacity.
 */
export function availabilityAfterBreakdown(
  dayIntervals: WorkInterval[],
  downFrom: number,
  downTo: number
): { closed: true } | { closed: false; startMinute: number; endMinute: number } {
  const from = Math.max(0, Math.min(1_440, downFrom));
  const to = Math.max(from, Math.min(1_440, downTo));
  const after = dayIntervals
    .map((row) => ({ startMinute: Math.max(row.startMinute, to), endMinute: row.endMinute }))
    .filter((row) => row.endMinute > row.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute);
  if (after.length === 0) return { closed: true };
  return { closed: false, startMinute: after[0]!.startMinute, endMinute: after[after.length - 1]!.endMinute };
}

/** Split a down window that may cross midnight into per-plant-day [from, to) minute pairs. */
export function splitDownWindow(startMinute: number, durationMinutes: number): Array<{ dayOffset: number; from: number; to: number }> {
  const out: Array<{ dayOffset: number; from: number; to: number }> = [];
  let remaining = Math.max(0, durationMinutes);
  let from = Math.max(0, Math.min(1_439, startMinute));
  let dayOffset = 0;
  while (remaining > 0 && dayOffset < 3) {
    const to = Math.min(1_440, from + remaining);
    out.push({ dayOffset, from, to });
    remaining -= to - from;
    from = 0;
    dayOffset += 1;
  }
  return out;
}
