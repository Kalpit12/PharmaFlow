import type {
  DueState,
  QualityAttentionItem,
  QualityExceptionRow,
  QualityExceptionSeverity,
  QualityExceptionStatus,
  QualityExceptionType,
} from "@/lib/quality/types";

const VALID_TRANSITIONS: Record<QualityExceptionStatus, QualityExceptionStatus[]> = {
  OPEN: ["INVESTIGATING", "ACTION_REQUIRED", "RESOLVED", "CLOSED"],
  INVESTIGATING: ["ACTION_REQUIRED", "RESOLVED", "CLOSED"],
  ACTION_REQUIRED: ["INVESTIGATING", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

const OPEN_STATUSES: QualityExceptionStatus[] = ["OPEN", "INVESTIGATING", "ACTION_REQUIRED"];

export function allowedQualityTransitions(status: QualityExceptionStatus): QualityExceptionStatus[] {
  return VALID_TRANSITIONS[status];
}

export function canTransitionQualityStatus(from: QualityExceptionStatus, to: QualityExceptionStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function isOpenQualityStatus(status: QualityExceptionStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function parseQualityType(value?: string): QualityExceptionType | null {
  const types: QualityExceptionType[] = [
    "NON_CONFORMANCE",
    "DEVIATION",
    "QUALITY_INCIDENT",
    "MATERIAL_ISSUE",
    "BATCH_ISSUE",
    "DOCUMENTATION_ISSUE",
    "OTHER",
  ];
  return types.includes(value as QualityExceptionType) ? (value as QualityExceptionType) : null;
}

export function parseQualitySeverity(value?: string): QualityExceptionSeverity | null {
  const severities: QualityExceptionSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  return severities.includes(value as QualityExceptionSeverity) ? (value as QualityExceptionSeverity) : null;
}

export function parseQualityStatus(value?: string): QualityExceptionStatus | null {
  const statuses: QualityExceptionStatus[] = ["OPEN", "INVESTIGATING", "ACTION_REQUIRED", "RESOLVED", "CLOSED"];
  return statuses.includes(value as QualityExceptionStatus) ? (value as QualityExceptionStatus) : null;
}

export function computeDueState(
  dueDate: string | null | undefined,
  status: QualityExceptionStatus,
  now = new Date()
): DueState {
  if (!dueDate) return "NO_DUE_DATE";
  if (!isOpenQualityStatus(status)) return "NO_DUE_DATE";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "NO_DUE_DATE";
  const ms = due.getTime() - now.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days < 0) return "OVERDUE";
  if (days <= 3) return "DUE_SOON";
  return "ON_TRACK";
}

export function computeAgeDays(createdAt: string, now = new Date()): number {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
}

export function buildQualityAttention(
  rows: Array<
    Pick<QualityExceptionRow, "id" | "reference" | "title" | "severity" | "status" | "dueState" | "ownerName" | "entity">
  >
): QualityAttentionItem[] {
  const items: QualityAttentionItem[] = [];
  const open = rows.filter((row) => isOpenQualityStatus(row.status));

  const critical = open.filter((row) => row.severity === "CRITICAL");
  if (critical.length === 1) {
    const row = critical[0]!;
    items.push({
      id: `quality-critical-${row.id}`,
      severity: "CRITICAL",
      title: `Critical quality exception affecting ${row.entity.entityLabel}.`,
      detail: `${row.reference} · ${row.title}`,
      href: `/quality?exception=${row.id}`,
    });
  } else if (critical.length > 1) {
    items.push({
      id: "quality-critical-many",
      severity: "CRITICAL",
      title: `${critical.length} critical quality exceptions are open.`,
      detail: "Review ownership, due dates, and corrective actions.",
      href: "/quality?view=critical",
    });
  }

  const overdue = open.filter((row) => row.dueState === "OVERDUE");
  if (overdue.length === 1) {
    const row = overdue[0]!;
    items.push({
      id: `quality-overdue-${row.id}`,
      severity: "HIGH",
      title: `Quality exception ${row.reference} is overdue.`,
      detail: row.title,
      href: `/quality?exception=${row.id}`,
    });
  } else if (overdue.length > 1) {
    items.push({
      id: "quality-overdue-many",
      severity: "HIGH",
      title: `${overdue.length} quality exceptions are overdue.`,
      detail: "Deterministic due-date comparison against open statuses.",
      href: "/quality?view=overdue",
    });
  }

  const unassigned = open.filter((row) => !row.ownerName);
  if (unassigned.length >= 2) {
    items.push({
      id: "quality-unassigned",
      severity: "WARNING",
      title: `${unassigned.length} quality exceptions remain unassigned.`,
      detail: "Assign an owner to maintain operational control.",
      href: "/quality?view=unassigned",
    });
  }

  return items;
}

export function nextQualityReference(existingCount: number, year = new Date().getUTCFullYear()): string {
  return `Q-${year}-${String(existingCount + 1).padStart(3, "0")}`;
}

export function validateQualityText(value: string | undefined, label: string, max = 500): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length < 3) return `${label} must be at least 3 characters.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

export function statusLabel(status: QualityExceptionStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function typeLabel(type: QualityExceptionType): string {
  return type
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function dueStateLabel(state: DueState): string {
  if (state === "ON_TRACK") return "On track";
  if (state === "DUE_SOON") return "Due soon";
  if (state === "OVERDUE") return "Overdue";
  return "No due date";
}
