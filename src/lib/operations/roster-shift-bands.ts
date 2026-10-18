import {
  PLANT_DAY_SHIFT_END,
  PLANT_DAY_SHIFT_START,
  PLANT_NIGHT_SHIFT_END,
  PLANT_NIGHT_SHIFT_START,
} from "@/lib/operations/plant-shift-template";

export type RosterShiftBand = {
  startMinute: number;
  endMinute: number;
  shiftLabel: "Day" | "Night" | "24h";
};

/** Roster chips (not APS calendar segments): overnight is one band with endMinute > 1440. */
export function rosterBandsForWorkstation(shiftRows: Array<{ weekday: number; startMinute: number; endMinute: number }>, weekday: number): RosterShiftBand[] {
  const onDay = shiftRows.filter((row) => row.weekday === weekday);
  if (onDay.length === 0) return [];

  const is24h =
    onDay.length === 1 && onDay[0]!.startMinute === 0 && onDay[0]!.endMinute >= 1_440;
  if (is24h || shiftRows.some((row) => row.weekday === 0 && row.startMinute === 0 && row.endMinute >= 1_440)) {
    const coversAllWeek = [0, 1, 2, 3, 4, 5, 6].every((d) =>
      shiftRows.some((row) => row.weekday === d && row.startMinute === 0 && row.endMinute >= 1_440)
    );
    if (coversAllWeek) {
      return [{ startMinute: 0, endMinute: 1_440, shiftLabel: "24h" }];
    }
  }

  const bands: RosterShiftBand[] = [];
  const hasDay = onDay.some(
    (row) => row.startMinute === PLANT_DAY_SHIFT_START && row.endMinute === PLANT_DAY_SHIFT_END
  );
  if (hasDay) {
    bands.push({
      startMinute: PLANT_DAY_SHIFT_START,
      endMinute: PLANT_DAY_SHIFT_END,
      shiftLabel: "Day",
    });
  }

  const nightStartSameDay = onDay.some(
    (row) => row.startMinute === PLANT_NIGHT_SHIFT_START && row.endMinute >= 1_440
  );
  const morningTail = onDay.some((row) => row.startMinute === 0 && row.endMinute === PLANT_NIGHT_SHIFT_END);
  if (nightStartSameDay) {
    bands.push({
      startMinute: PLANT_NIGHT_SHIFT_START,
      endMinute: 1_440 + PLANT_NIGHT_SHIFT_END,
      shiftLabel: "Night",
    });
  } else if (morningTail && weekday >= 1 && weekday <= 6) {
    // Orphan morning segment from legacy split data — attach visually to previous day in seed, skip here.
  }

  if (bands.length > 0) return bands;

  return onDay
    .filter((row) => row.endMinute > row.startMinute)
    .map((row) => ({
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      shiftLabel: row.startMinute >= PLANT_NIGHT_SHIFT_START ? "Night" : "Day",
    }));
}
