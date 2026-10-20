import { skillAreaForWorkstationGroup } from "@/lib/operations/lab-allied-roster-staffing";

export type RosterChipForValidation = {
  id: string;
  employeeId: string | null;
  employeeCode?: string | null;
  workstationId?: string;
  date: string;
  startMinute: number;
  endMinute: number;
  groupCode: string | null;
};

const OPERATOR_AREA: Record<string, string> = {};
// Filled at runtime from seed codes — pattern OP-XX-##
for (const prefix of ["BL", "CT", "FL", "PK", "BS", "DP", "QC"]) {
  for (let i = 1; i <= 6; i += 1) {
    OPERATOR_AREA[`OP-${prefix}-${String(i).padStart(2, "0")}`] = prefix;
  }
}

function chipEndMs(date: string, endMinute: number): number {
  const [y, m, d] = date.split("-").map(Number);
  const base = Date.UTC(y!, m! - 1, d!);
  if (endMinute > 1_440) return base + endMinute * 60_000;
  return base + endMinute * 60_000;
}

function chipStartMs(date: string, startMinute: number): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) + startMinute * 60_000;
}

function shiftBand(startMinute: number, endMinute: number): "Day" | "Night" | "24h" {
  if (startMinute === 0 && endMinute >= 1_440) return "24h";
  if (startMinute >= 18 * 60 || endMinute > 1_440) return "Night";
  return "Day";
}

function operatorSkillPrefix(code: string | null | undefined): string | null {
  if (!code) return null;
  const match = /^OP-([A-Z]{2})-/.exec(code);
  return match?.[1] ?? null;
}

function groupSkillPrefix(groupCode: string | null): string | null {
  const area = skillAreaForWorkstationGroup(groupCode);
  const map: Record<string, string> = {
    BLEND_COMP: "BL",
    COAT: "CT",
    FILL: "FL",
    PACK: "PK",
    BLISTER: "BS",
    DPS: "DP",
    QC: "QC",
  };
  return map[area] ?? null;
}

export function validateRosterChips(chips: RosterChipForValidation[]): Map<string, string[]> {
  const warnings = new Map<string, string[]>();
  const add = (id: string, msg: string) => {
    const list = warnings.get(id) ?? [];
    if (!list.includes(msg)) list.push(msg);
    warnings.set(id, list);
  };

  const byEmployee = new Map<string, RosterChipForValidation[]>();
  for (const chip of chips) {
    if (!chip.employeeId) continue;
    const list = byEmployee.get(chip.employeeId) ?? [];
    list.push(chip);
    byEmployee.set(chip.employeeId, list);
  }

  for (const [, list] of byEmployee) {
    const sorted = [...list].sort((a, b) => chipStartMs(a.date, a.startMinute) - chipStartMs(b.date, b.startMinute));

    const intervals = sorted.map((chip) => ({
      chip,
      start: chipStartMs(chip.date, chip.startMinute),
      end: chipEndMs(chip.date, chip.endMinute),
    }));

    function mergedMinutesInWindow(anchorStart: number, windowMs: number): number {
      const windowEnd = anchorStart + windowMs;
      const clipped = intervals
        .map(({ start, end }) => ({
          start: Math.max(start, anchorStart),
          end: Math.min(end, windowEnd),
        }))
        .filter((span) => span.end > span.start)
        .sort((a, b) => a.start - b.start);
      let total = 0;
      let curStart = -1;
      let curEnd = -1;
      for (const span of clipped) {
        if (curStart < 0) {
          curStart = span.start;
          curEnd = span.end;
          continue;
        }
        if (span.start <= curEnd) {
          curEnd = Math.max(curEnd, span.end);
        } else {
          total += (curEnd - curStart) / 60_000;
          curStart = span.start;
          curEnd = span.end;
        }
      }
      if (curStart >= 0) total += (curEnd - curStart) / 60_000;
      return total;
    }

    for (let i = 0; i < intervals.length; i += 1) {
      const anchor = intervals[i]!;
      const chip = anchor.chip;
      if (chip.startMinute === 0 && chip.endMinute >= 1_440) continue;
      const minutesInWindow = mergedMinutesInWindow(anchor.start, 24 * 60 * 60_000);
      if (minutesInWindow > 12 * 60) {
        add(chip.id, "More than 12 hours scheduled in 24h.");
      }
    }

    for (let i = 1; i < intervals.length; i += 1) {
      const prev = intervals[i - 1]!;
      const cur = intervals[i]!;
      const restHours = (cur.start - prev.end) / 3_600_000;
      if (restHours >= 0 && restHours < 11) {
        add(cur.chip.id, "Less than 11 hours rest since previous shift.");
        add(prev.chip.id, "Less than 11 hours rest before next shift.");
      }
    }

    for (const chip of sorted) {
      const skill = operatorSkillPrefix(chip.employeeCode);
      const need = groupSkillPrefix(chip.groupCode);
      if (skill && need && skill !== need) {
        add(chip.id, "Operator skill does not match this workstation area.");
      }

      const band = shiftBand(chip.startMinute, chip.endMinute);
      const sameBandSameDay = sorted.filter(
        (other) =>
          other.date === chip.date && shiftBand(other.startMinute, other.endMinute) === band
      );
      const workstationCount = new Set(
        sameBandSameDay.map((other) => other.workstationId).filter(Boolean)
      ).size;
      if (workstationCount > 2) {
        add(chip.id, "More than two workstations in the same shift (max 2).");
      }
    }

  }

  return warnings;
}
