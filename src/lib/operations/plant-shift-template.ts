/** MediCrest / demo plant wall-clock shifts (EAT). Day + night with a 17:30–18:00 handover gap. */

export const PLANT_DAY_SHIFT_START = 8 * 60; // 08:00
export const PLANT_DAY_SHIFT_END = 17 * 60 + 30; // 17:30
export const PLANT_NIGHT_SHIFT_START = 18 * 60; // 18:00
export const PLANT_NIGHT_SHIFT_END = 6 * 60; // 06:00 next plant morning

export type PlantShiftRow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

/** Mon–Fri day + night; Sat day only. Night is stored as two segments (18:00–24:00, 00:00–06:00). */
export function buildStandardPlantShiftRows(weekdays: number[] = [1, 2, 3, 4, 5, 6]): PlantShiftRow[] {
  const rows: PlantShiftRow[] = [];
  for (const weekday of weekdays.filter((d) => d >= 1 && d <= 5)) {
    rows.push({ weekday, startMinute: PLANT_DAY_SHIFT_START, endMinute: PLANT_DAY_SHIFT_END });
    rows.push({ weekday, startMinute: PLANT_NIGHT_SHIFT_START, endMinute: 1_440 });
    const morningWeekday = weekday === 5 ? 6 : weekday + 1;
    if (morningWeekday <= 6) {
      rows.push({ weekday: morningWeekday, startMinute: 0, endMinute: PLANT_NIGHT_SHIFT_END });
    }
  }
  if (weekdays.includes(6)) {
    rows.push({ weekday: 6, startMinute: PLANT_DAY_SHIFT_START, endMinute: PLANT_DAY_SHIFT_END });
  }
  return rows;
}

/** Logical shift bands per week (5 day + 5 night + 1 Saturday day) for plant lines. */
export const PLANT_LOGICAL_SHIFTS_PER_WEEK = 11;

/** Typical Mon–Fri capacity: 9.5h day + 12h night = 21.5h per calendar day (Lab & Allied layout). */
export const PLANT_CAPACITY_HOURS_PER_DAY = 21.5;
