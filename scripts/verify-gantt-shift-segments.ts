import assert from "node:assert/strict";

import { buildWorkCalendar, intervalsForDay } from "../src/lib/operations/calendar";
import { buildOnShiftBlocks } from "../src/lib/operations/gantt-off-shift";
import {
  PLANT_DAY_SHIFT_START,
  PLANT_NIGHT_SHIFT_START,
  buildStandardPlantShiftRows,
} from "../src/lib/operations/plant-shift-template";
import { plantMinuteOfDay } from "../src/lib/operations/plant-time";
import {
  mergeMidnightShiftSplits,
  shortBatchLabel,
  workingSegmentsInRange,
} from "../src/lib/operations/gantt-shift-segments";
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

function testShortBatchLabels() {
  assert.equal(shortBatchLabel("BT-GANTT-01"), "G-01");
  assert.equal(shortBatchLabel("PRP-GANTT-2026"), "PRP");
  assert.equal(shortBatchLabel("BATCH-B-024"), "B-024");
  console.log("verify-gantt-shift-segments: short batch labels OK");
}

function testMidnightMerge() {
  const merged = mergeMidnightShiftSplits([
    { start: "2026-10-16T15:00:00.000Z", end: "2026-10-16T21:00:00.000Z" },
    { start: "2026-10-16T21:00:00.000Z", end: "2026-10-17T03:00:00.000Z" },
  ]);
  assert.equal(merged.length, 1);
  console.log("verify-gantt-shift-segments: midnight merge OK");
}

/** Lab & Allied plant template: day from 08:30, night from 19:00 EAT (Fri 16 Oct 2026). */
function testLabAlliedPlantShiftAnchors() {
  const calendar = buildWorkCalendar({
    capacityHoursPerDay: 16,
    shifts: buildStandardPlantShiftRows(),
  });
  const friday = startOfPlantDay(new Date("2026-10-16T12:00:00.000Z"));
  const fridayIntervals = intervalsForDay(friday, calendar);
  const dayShift = fridayIntervals.find((row) => row.startMinute === PLANT_DAY_SHIFT_START);
  assert.ok(dayShift, "Friday day shift should start at 08:30 plant time");
  assert.equal(dayShift!.endMinute, 17 * 60 + 30);

  const nightStart = atPlantMinuteFromTemplate(friday, PLANT_NIGHT_SHIFT_START);
  const blocks = buildOnShiftBlocks(
    new Date("2026-10-16T15:00:00.000Z"),
    new Date("2026-10-17T06:00:00.000Z"),
    "ws-test",
    calendar
  );
  const nightBlock = blocks.find((row) => plantMinuteOfDay(new Date(row.start)) === PLANT_NIGHT_SHIFT_START);
  assert.ok(nightBlock, "Night shift block should begin at 19:00 EAT");
  assert.equal(new Date(nightBlock!.start).getTime(), nightStart.getTime());
  console.log("verify-gantt-shift-segments: L&A plant shift anchors OK");
}

function atPlantMinuteFromTemplate(plantDayStart: Date, minuteOfDay: number): Date {
  return new Date(plantDayStart.getTime() + minuteOfDay * 60_000);
}

testOvernightSplit();
testShortBatchLabels();
testMidnightMerge();
testLabAlliedPlantShiftAnchors();
