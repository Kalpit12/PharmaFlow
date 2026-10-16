/** Workstations that consume elapsed time only (no finite shift capacity on the Gantt). */
export const ELAPSED_ONLY_WORKSTATION_CODES = new Set(["QC-HOLD", "QC-PROC", "SFG-QUAR"]);

export function isElapsedOnlyWorkstation(code: string | null | undefined): boolean {
  if (!code) return false;
  return ELAPSED_ONLY_WORKSTATION_CODES.has(code);
}
