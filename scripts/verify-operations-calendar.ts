import assert from "node:assert/strict";

import {
  addWorkingMinutesOnCalendar,
  alignToCalendar,
  availableWorkingMinutes,
  buildWorkCalendar,
  createStandardWorkCalendar,
} from "../src/lib/operations/calendar";
import { buildSchedule, type PlannerOrder, type PlannerWorkstation } from "../src/lib/operations/schedule";

const calendar = createStandardWorkCalendar(8);
const friday = new Date("2026-10-09T08:00:00.000Z");

assert.equal(
  addWorkingMinutesOnCalendar(friday, 600, calendar).toISOString(),
  "2026-10-12T10:00:00.000Z",
  "a ten-hour job skips the non-working weekend"
);
assert.equal(
  alignToCalendar(new Date("2026-10-10T09:00:00.000Z"), calendar).toISOString(),
  "2026-10-12T08:00:00.000Z",
  "weekend starts align to Monday shift start"
);
assert.equal(
  availableWorkingMinutes(
    new Date("2026-10-05T00:00:00.000Z"),
    new Date("2026-10-12T00:00:00.000Z"),
    calendar
  ),
  2_400,
  "a standard week exposes forty working hours"
);

const holidayCalendar = {
  ...calendar,
  exceptions: [
    {
      date: "2026-10-12",
      reason: "Planned shutdown",
      intervals: [],
    },
  ],
};
assert.equal(
  addWorkingMinutesOnCalendar(friday, 600, holidayCalendar).toISOString(),
  "2026-10-13T10:00:00.000Z",
  "calendar exceptions remove unavailable shifts"
);

const workstation: PlannerWorkstation = {
  id: "line-a",
  name: "Line A",
  code: "LA",
  capacityHoursPerDay: 8,
  calendar,
};
const orders: PlannerOrder[] = [
  {
    id: "order-a",
    orderNumber: "PRO-001",
    productName: "Demo product",
    workstationId: "line-a",
    durationMinutes: 600,
    priority: "HIGH",
    dueDate: new Date("2026-10-13T16:00:00.000Z"),
    createdAt: new Date("2026-10-01T08:00:00.000Z"),
    isLocked: false,
    plannedStart: null,
    plannedEnd: null,
  },
];
const scheduled = buildSchedule(
  orders,
  [workstation],
  { start: friday, end: new Date("2026-10-16T00:00:00.000Z") }
);
assert.equal(scheduled.orders[0]?.plannedEnd?.toISOString(), "2026-10-12T10:00:00.000Z");
assert.equal(scheduled.orders[0]?.displayStatus, "SCHEDULED");

const saturdayShift = buildWorkCalendar({
  capacityHoursPerDay: 8,
  shifts: [
    { weekday: 1, startMinute: 8 * 60, endMinute: 16 * 60 },
    { weekday: 2, startMinute: 8 * 60, endMinute: 16 * 60 },
    { weekday: 3, startMinute: 8 * 60, endMinute: 16 * 60 },
    { weekday: 4, startMinute: 8 * 60, endMinute: 16 * 60 },
    { weekday: 5, startMinute: 8 * 60, endMinute: 16 * 60 },
    { weekday: 6, startMinute: 8 * 60, endMinute: 12 * 60 },
  ],
  exceptions: [{ date: "2026-10-10", reason: "Plant shutdown", closed: true }],
});
assert.match(saturdayShift.label, /Sat/);
assert.equal(
  addWorkingMinutesOnCalendar(new Date("2026-10-09T15:00:00.000Z"), 120, saturdayShift).toISOString(),
  "2026-10-12T09:00:00.000Z",
  "Saturday half-shift is skipped when a dated plant shutdown closes Saturday"
);
const saturdayOpen = buildWorkCalendar({
  capacityHoursPerDay: 8,
  shifts: saturdayShift.weekly
    ? [
        { weekday: 1, startMinute: 8 * 60, endMinute: 16 * 60 },
        { weekday: 2, startMinute: 8 * 60, endMinute: 16 * 60 },
        { weekday: 3, startMinute: 8 * 60, endMinute: 16 * 60 },
        { weekday: 4, startMinute: 8 * 60, endMinute: 16 * 60 },
        { weekday: 5, startMinute: 8 * 60, endMinute: 16 * 60 },
        { weekday: 6, startMinute: 8 * 60, endMinute: 12 * 60 },
      ]
    : [],
});
assert.equal(
  addWorkingMinutesOnCalendar(new Date("2026-10-09T15:00:00.000Z"), 120, saturdayOpen).toISOString(),
  "2026-10-10T09:00:00.000Z",
  "Saturday half-shift is used when no exception closes the day"
);

console.log("Operations work-calendar verification passed.");
