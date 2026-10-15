import type { WorkstationKind } from "@prisma/client";

export type WorkstationCsvRow = {
  code: string;
  name: string;
  kind: WorkstationKind;
  capacityHoursPerDay: number;
  siteCode: string | null;
  groupCode: string | null;
  active: boolean;
};

export type WorkstationCsvIssue = {
  line: number;
  message: string;
};

const KINDS = new Set<string>(["PRODUCTION_LINE", "PACKAGING_LINE", "CLEAN_ROOM", "SUBCONTRACT"]);

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "" || v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  throw new Error(`Invalid boolean "${value}"`);
}

/** Minimal RFC4180-ish CSV rows (no embedded newlines). */
export function parseWorkstationCsv(text: string): { rows: WorkstationCsvRow[]; issues: WorkstationCsvIssue[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const issues: WorkstationCsvIssue[] = [];
  if (lines.length === 0) {
    return { rows: [], issues: [{ line: 0, message: "CSV is empty." }] };
  }

  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  for (const col of ["code", "name", "kind"]) {
    if (idx(col) < 0) issues.push({ line: 1, message: `Missing column: ${col}` });
  }
  const capIdx = idx("capacityhoursperday") >= 0 ? idx("capacityhoursperday") : idx("capacity_hours_per_day");
  if (capIdx < 0) issues.push({ line: 1, message: "Missing column: capacityHoursPerDay" });
  if (issues.length > 0) return { rows: [], issues };
  const rows: WorkstationCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const cells = lines[i].split(",").map((c) => c.trim());
    try {
      const code = cells[idx("code")] ?? "";
      const name = cells[idx("name")] ?? "";
      const kindRaw = (cells[idx("kind")] ?? "PRODUCTION_LINE").toUpperCase();
      if (!code || !name) {
        issues.push({ line: lineNo, message: "code and name are required." });
        continue;
      }
      if (!KINDS.has(kindRaw)) {
        issues.push({ line: lineNo, message: `Unknown kind "${kindRaw}".` });
        continue;
      }
      const capacity = Number.parseInt(cells[capIdx] ?? "8", 10);
      if (!Number.isFinite(capacity) || capacity <= 0) {
        issues.push({ line: lineNo, message: "capacityHoursPerDay must be a positive integer." });
        continue;
      }
      const siteCode = idx("sitecode") >= 0 ? cells[idx("sitecode")] || null : idx("site_code") >= 0 ? cells[idx("site_code")] || null : null;
      const groupCode =
        idx("groupcode") >= 0 ? cells[idx("groupcode")] || null : idx("group_code") >= 0 ? cells[idx("group_code")] || null : null;
      const activeIdx = idx("active");
      const active = activeIdx >= 0 ? parseBool(cells[activeIdx] ?? "true") : true;
      rows.push({
        code,
        name,
        kind: kindRaw as WorkstationKind,
        capacityHoursPerDay: capacity,
        siteCode,
        groupCode,
        active,
      });
    } catch (error) {
      issues.push({ line: lineNo, message: error instanceof Error ? error.message : "Invalid row." });
    }
  }

  return { rows, issues };
}

export const WORKSTATION_CSV_TEMPLATE = `code,name,kind,capacityHoursPerDay,siteCode,groupCode,active
GRN-01,Granulator 1,PRODUCTION_LINE,8,NBO-PLT,GRAN,true
`;
