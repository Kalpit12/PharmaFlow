/** Realistic L&A demo roster: day/night crews, max 2 lines per person per shift, no double shifts same day. */

export type SkillArea = "BLEND_COMP" | "COAT" | "FILL" | "PACK" | "BLISTER" | "DPS" | "QC";

export type LabAlliedOperatorSeed = {
  code: string;
  name: string;
  area: SkillArea;
  crew: "A" | "B";
};

export const LAB_ALLIED_OPERATORS: LabAlliedOperatorSeed[] = [
  { code: "OP-BL-01", name: "Grace Wanjiku", area: "BLEND_COMP", crew: "A" },
  { code: "OP-BL-02", name: "James Otieno", area: "BLEND_COMP", crew: "A" },
  { code: "OP-BL-03", name: "Mary Akinyi", area: "BLEND_COMP", crew: "A" },
  { code: "OP-BL-04", name: "Peter Kamau", area: "BLEND_COMP", crew: "B" },
  { code: "OP-BL-05", name: "Sarah Mwangi", area: "BLEND_COMP", crew: "B" },
  { code: "OP-BL-06", name: "David Ochieng", area: "BLEND_COMP", crew: "B" },
  { code: "OP-CT-01", name: "Lucy Njeri", area: "COAT", crew: "A" },
  { code: "OP-CT-02", name: "Daniel Mutua", area: "COAT", crew: "A" },
  { code: "OP-CT-03", name: "Faith Chebet", area: "COAT", crew: "B" },
  { code: "OP-CT-04", name: "Brian Kipchoge", area: "COAT", crew: "B" },
  { code: "OP-FL-01", name: "Ann Wambui", area: "FILL", crew: "A" },
  { code: "OP-FL-02", name: "Samuel Njoroge", area: "FILL", crew: "A" },
  { code: "OP-FL-03", name: "Joyce Achieng", area: "FILL", crew: "A" },
  { code: "OP-FL-04", name: "Michael Odhiambo", area: "FILL", crew: "B" },
  { code: "OP-FL-05", name: "Ruth Wanjala", area: "FILL", crew: "B" },
  { code: "OP-FL-06", name: "Kevin Mutai", area: "FILL", crew: "B" },
  { code: "OP-PK-01", name: "Hannah Muthoni", area: "PACK", crew: "A" },
  { code: "OP-PK-02", name: "Joseph Kamau", area: "PACK", crew: "A" },
  { code: "OP-PK-03", name: "Esther Nyambura", area: "PACK", crew: "A" },
  { code: "OP-PK-04", name: "George Owino", area: "PACK", crew: "B" },
  { code: "OP-PK-05", name: "Linda Chepkoech", area: "PACK", crew: "B" },
  { code: "OP-PK-06", name: "Paul Kariuki", area: "PACK", crew: "B" },
  { code: "OP-BS-01", name: "Alice Moraa", area: "BLISTER", crew: "A" },
  { code: "OP-BS-02", name: "Tom Omondi", area: "BLISTER", crew: "A" },
  { code: "OP-BS-03", name: "Catherine Wairimu", area: "BLISTER", crew: "B" },
  { code: "OP-BS-04", name: "Eric Langat", area: "BLISTER", crew: "B" },
  { code: "OP-DP-01", name: "Diana Nafula", area: "DPS", crew: "A" },
  { code: "OP-DP-02", name: "Victor Bett", area: "DPS", crew: "A" },
  { code: "OP-DP-03", name: "Naomi Jerotich", area: "DPS", crew: "B" },
  { code: "OP-DP-04", name: "Collins Tanui", area: "DPS", crew: "B" },
  { code: "OP-QC-01", name: "Dr. Irene Kiplagat", area: "QC", crew: "A" },
  { code: "OP-QC-02", name: "Walter Musyoka", area: "QC", crew: "A" },
  { code: "OP-QC-03", name: "Patricia Mwangi", area: "QC", crew: "A" },
  { code: "OP-QC-04", name: "Allan Kiprotich", area: "QC", crew: "B" },
  { code: "OP-QC-05", name: "Monica Wanjiru", area: "QC", crew: "B" },
  { code: "OP-QC-06", name: "Henry Ochieng", area: "QC", crew: "B" },
];

const GROUP_TO_AREA: Record<string, SkillArea> = {
  "LA-BLEND": "BLEND_COMP",
  "LA-COMP": "BLEND_COMP",
  "LA-COAT": "COAT",
  "LA-FILL": "FILL",
  "LA-PACK": "PACK",
  "LA-BLISTER": "BLISTER",
  "LA-LINE": "DPS",
  "LA-QUAR": "QC",
  "LA-QC": "QC",
};

export function skillAreaForWorkstationGroup(groupCode: string | null | undefined): SkillArea {
  if (!groupCode) return "PACK";
  return GROUP_TO_AREA[groupCode] ?? "PACK";
}

type ShiftKind = "Day" | "Night" | "24h";

function weekIndexFromYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y!, m! - 1, d!);
  return Math.floor(t / (7 * 86_400_000));
}

/** Crew A on day / B on night, swapping each week. */
export function crewWorksShift(crew: "A" | "B", shift: ShiftKind, weekIndex: number): boolean {
  if (shift === "24h") return true;
  const aOnDay = weekIndex % 2 === 0;
  if (shift === "Day") return crew === "A" ? aOnDay : !aOnDay;
  return crew === "A" ? !aOnDay : aOnDay;
}

export function operatorsForSlot(area: SkillArea, shift: ShiftKind, weekIndex: number): LabAlliedOperatorSeed[] {
  return LAB_ALLIED_OPERATORS.filter(
    (row) => row.area === area && (shift === "24h" || crewWorksShift(row.crew, shift, weekIndex))
  );
}

export type RosterAssignmentSlot = {
  dateYmd: string;
  shiftLabel: string;
  startMinute: number;
  endMinute: number;
  groupCode: string | null;
  workstationCode: string;
};

type EmployeeRef = { id: string; code: string; name: string };

const codeToEmployee = new Map<string, EmployeeRef>();

export function registerRosterEmployees(employees: EmployeeRef[]): void {
  codeToEmployee.clear();
  for (const row of employees) codeToEmployee.set(row.code, row);
}

/** Tracks concurrent assignments per person per calendar day + shift band. */
const slotLoad = new Map<string, number>();
const lastEndByEmployee = new Map<string, number>();

const MIN_REST_MS = 11 * 3_600_000;

function loadKey(employeeId: string, dateYmd: string, shift: ShiftKind): string {
  return `${employeeId}|${dateYmd}|${shift}`;
}

function slotTimes(slot: RosterAssignmentSlot): { startMs: number; endMs: number } {
  const [y, m, d] = slot.dateYmd.split("-").map(Number);
  const dayStart = Date.UTC(y!, m! - 1, d!);
  const startMs = dayStart + slot.startMinute * 60_000;
  const endMs = dayStart + slot.endMinute * 60_000;
  return { startMs, endMs };
}

export function resetRosterAssignmentLoads(): void {
  slotLoad.clear();
  lastEndByEmployee.clear();
}

export function resetRosterSlotLoads(): void {
  slotLoad.clear();
}

export function assignOperatorForSlot(slot: RosterAssignmentSlot): EmployeeRef | null {
  const shift: ShiftKind =
    slot.shiftLabel === "24h" ? "24h" : slot.shiftLabel === "Night" || slot.startMinute >= 18 * 60 ? "Night" : "Day";
  const area = skillAreaForWorkstationGroup(slot.groupCode);
  const weekIndex = weekIndexFromYmd(slot.dateYmd);
  const pool = operatorsForSlot(area, shift, weekIndex);
  if (pool.length === 0) return null;

  const wsHash =
    slot.workstationCode.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) +
    slot.dateYmd.split("-").reduce((sum, part) => sum + Number(part), 0);

  const { startMs, endMs } = slotTimes(slot);
  pool.sort((a, b) => a.code.localeCompare(b.code));
  let best: { emp: EmployeeRef; load: number } | null = null;
  for (let i = 0; i < pool.length; i += 1) {
    const pick = pool[(wsHash + i) % pool.length]!;
    const emp = codeToEmployee.get(pick.code);
    if (!emp) continue;
    const prevEnd = lastEndByEmployee.get(emp.id);
    if (prevEnd != null && startMs - prevEnd < MIN_REST_MS) continue;
    const key = loadKey(emp.id, slot.dateYmd, shift);
    const load = slotLoad.get(key) ?? 0;
    if (load >= 2) continue;
    if (!best || load < best.load) best = { emp, load };
  }
  if (!best) {
    for (let i = 0; i < pool.length; i += 1) {
      const pick = pool[(wsHash + i) % pool.length]!;
      const emp = codeToEmployee.get(pick.code);
      if (!emp) continue;
      const prevEnd = lastEndByEmployee.get(emp.id);
      if (prevEnd != null && startMs - prevEnd < MIN_REST_MS) continue;
      const key = loadKey(emp.id, slot.dateYmd, shift);
      if ((slotLoad.get(key) ?? 0) >= 2) continue;
      slotLoad.set(key, (slotLoad.get(key) ?? 0) + 1);
      lastEndByEmployee.set(emp.id, Math.max(lastEndByEmployee.get(emp.id) ?? 0, endMs));
      return emp;
    }
    return null;
  }
  const key = loadKey(best.emp.id, slot.dateYmd, shift);
  slotLoad.set(key, (slotLoad.get(key) ?? 0) + 1);
  lastEndByEmployee.set(best.emp.id, Math.max(lastEndByEmployee.get(best.emp.id) ?? 0, endMs));
  return best.emp;
}

export function crewLabelForCode(operatorCode: string): string {
  const row = LAB_ALLIED_OPERATORS.find((op) => op.code === operatorCode);
  if (!row) return "—";
  const area = row.area.replace("_", "/");
  return `${area} Crew ${row.crew}`;
}

const AREA_DISPLAY: Record<SkillArea, string> = {
  BLEND_COMP: "BLEND/COMP",
  COAT: "COAT",
  FILL: "FILL",
  PACK: "PACK",
  BLISTER: "BLISTER",
  DPS: "DPS",
  QC: "QC",
};

export function skillGroupLabelForCode(operatorCode: string): string {
  const row = LAB_ALLIED_OPERATORS.find((op) => op.code === operatorCode);
  if (!row) return "—";
  return AREA_DISPLAY[row.area];
}
