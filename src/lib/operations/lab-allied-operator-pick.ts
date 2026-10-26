import {
  LAB_ALLIED_OPERATORS,
  operatorsForSlot,
  skillAreaForWorkstationGroup,
  type SkillArea,
} from "@/lib/operations/lab-allied-roster-staffing";
import { plantMinuteOfDay, plantWeekday, plantYmd } from "@/lib/operations/plant-time";

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function jitterInRange(seed: string, min: number, max: number): number {
  if (max <= min) return min;
  return min + (hashSeed(seed) % (max - min + 1));
}

function shiftKindAt(at: Date, area: SkillArea): "Day" | "Night" | "24h" {
  if (area === "QC") return "24h";
  const minute = plantMinuteOfDay(at);
  const weekday = plantWeekday(at);
  if (weekday === 0) return "Day";
  if (weekday === 6) return "Day";
  if (minute >= 8 * 60 && minute < 17 * 60 + 30) return "Day";
  return "Night";
}

function weekIndexAt(at: Date): number {
  const ymd = plantYmd(at);
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const dow = date.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + mondayOffset);
  return Math.floor(monday.getTime() / (7 * 86_400_000));
}

export function pickLabAlliedOperator(input: {
  operationCode: string;
  workstationGroupCode: string | null | undefined;
  at: Date;
  seed: string;
}): { code: string; name: string } {
  const group =
    input.operationCode === "QUAR" || input.operationCode === "QC" || input.operationCode === "QC-HOLD"
      ? "LA-QC"
      : input.workstationGroupCode;
  const area: SkillArea = skillAreaForWorkstationGroup(group);
  const shift = shiftKindAt(input.at, area);
  const weekIndex = weekIndexAt(input.at);
  const pool = operatorsForSlot(area, shift, weekIndex);
  const source = pool.length > 0 ? pool : LAB_ALLIED_OPERATORS.filter((row) => row.area === area);
  const fallback = source.length > 0 ? source : LAB_ALLIED_OPERATORS;
  const index = hashSeed(input.seed) % fallback.length;
  const picked = fallback[index]!;
  return { code: picked.code, name: picked.name };
}
