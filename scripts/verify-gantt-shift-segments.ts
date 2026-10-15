import assert from "node:assert/strict";

import { buildWorkCalendar } from "../src/lib/operations/calendar";
import { workingSegmentsInRange } from "../src/lib/operations/gantt-shift-segments";
import { startOfPlantDay } from "../src/lib/operations/plant-time";

/** BT-GANTT-01 style job: start late shift, run longer than remaining shift → must split overnight. */
function testOvernightSplit() {
  const calendar = buildWorkCalendar({
    capacityHoursPerDay: 16,
    shifts: [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
      { weekday, startMinute: 6 * 60, endMinute: 14 * 60 },
      { weekday, startMinute: 14 * 60, endMinute: 22 * 60 },
    ]),
  });

  const day = startOfPlantDay(new Date("2026-10-16T09:00:00.000Z"));
  const start = new Date(day.getTime() + (14 * 60 + 50) * 60_000);
  const end = new Date(day.getTime() + 86_400_000 + (9 * 60 + 48) * 60_000);

  const segments = workingSegmentsInRange(start, end, calendar);
  assert.ok(segments.length >= 2, `expected split segments, got ${segments.length}`);
  for (let i = 1; i < segments.length; i += 1) {
    assert.ok(
      new Date(segments[i]!.start).getTime() >= new Date(segments[i - 1]!.end).getTime(),
      "segments must not overlap"
    );
  }
  console.log("verify-gantt-shift-segments: overnight split OK", segments.length, "segments");
}

testOvernightSplit();
