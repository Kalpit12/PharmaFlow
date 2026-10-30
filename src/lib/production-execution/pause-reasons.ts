/** Shop-floor pause reason codes (spec Phase 5). Stored in the event reason as `CODE · note`. */

export const PAUSE_REASON_CODES = [
  "BREAKDOWN",
  "MATERIAL_MISSING",
  "WAITING_QA",
  "CHANGEOVER",
  "OPERATOR_BREAK",
  "OTHER",
] as const;

export type PauseReasonCode = (typeof PAUSE_REASON_CODES)[number];

export const PAUSE_REASON_LABELS: Record<PauseReasonCode, string> = {
  BREAKDOWN: "Breakdown",
  MATERIAL_MISSING: "Material missing",
  WAITING_QA: "Waiting QA",
  CHANGEOVER: "Cleaning / changeover",
  OPERATOR_BREAK: "Operator break",
  OTHER: "Other",
};

/** Pauses that mean the plan is wrong (not a planned break) — logged as DOWNTIME too, which can trigger a replan. */
const DOWNTIME_CODES = new Set<PauseReasonCode>(["BREAKDOWN", "MATERIAL_MISSING", "WAITING_QA"]);

export function parsePauseReasonCode(value: unknown): PauseReasonCode | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return (PAUSE_REASON_CODES as readonly string[]).includes(upper) ? (upper as PauseReasonCode) : null;
}

export function isDowntimePause(code: PauseReasonCode | null): boolean {
  return code != null && DOWNTIME_CODES.has(code);
}

export function formatPauseReason(code: PauseReasonCode | null, note?: string | null): string | undefined {
  const text = note?.trim();
  if (!code) return text || undefined;
  return text ? `${code} · ${text}` : code;
}

/** Reverse of formatPauseReason — tolerant of free-text reasons written before Round 12. */
export function readPauseReason(reason: string | null | undefined): { code: PauseReasonCode | null; label: string; note: string | null } {
  const raw = reason?.trim() ?? "";
  if (!raw) return { code: null, label: "Paused", note: null };
  const [head, ...rest] = raw.split(" · ");
  const code = parsePauseReasonCode(head);
  if (!code) return { code: null, label: raw, note: null };
  const note = rest.join(" · ").trim() || null;
  return { code, label: PAUSE_REASON_LABELS[code], note };
}
