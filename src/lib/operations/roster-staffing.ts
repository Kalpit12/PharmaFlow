/** Fictional demo staffing — area pools with day/night rotation. */

type EmployeeRef = { id: string; code: string; name: string };

const POOL_BY_GROUP: Record<string, string[]> = {
  "LA-BLEND": ["OP-001", "OP-002", "OP-003", "OP-004"],
  "LA-COMP": ["OP-001", "OP-002", "OP-003", "OP-004"],
  "LA-COAT": ["OP-001", "OP-002"],
  "LA-FILL": ["OP-005", "OP-006"],
  "LA-BLISTER": ["OP-007", "OP-008"],
  "LA-PACK": ["OP-007", "OP-008"],
  "LA-LINE": ["OP-006", "OP-008"],
  "LA-QUAR": ["OP-003", "OP-005"],
  "LA-QC": ["OP-004", "OP-006"],
};

export function pickRosterEmployee(input: {
  employees: EmployeeRef[];
  groupCode: string | null;
  workstationCode: string;
  shiftLabel: string;
  dateYmd: string;
  startMinute: number;
}): EmployeeRef | null {
  if (input.employees.length === 0) return null;
  const poolCodes = POOL_BY_GROUP[input.groupCode ?? ""] ?? ["OP-001", "OP-002"];
  const pool = input.employees.filter((row) => poolCodes.includes(row.code));
  const list = pool.length > 0 ? pool : input.employees;
  const dayHash = input.dateYmd.split("-").reduce((sum, part) => sum + Number(part), 0);
  const night = input.shiftLabel === "Night" || input.startMinute >= 18 * 60;
  const codeHash = input.workstationCode.charCodeAt(0) + input.workstationCode.charCodeAt(input.workstationCode.length - 1);
  const idx = (dayHash + codeHash + (night ? 17 : 3)) % list.length;
  return list[idx] ?? list[0] ?? null;
}
