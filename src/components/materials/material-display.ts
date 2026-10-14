import type { MaterialPriorityLevel, MaterialRequirement, MaterialRisk, ShortageStatus } from "@/lib/materials/types";
import type { StatusTone } from "@/types/status";

export const riskTone: Record<MaterialRisk, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "warning",
  OK: "success",
};

export const priorityTone: Record<MaterialPriorityLevel, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

export const shortageTone: Record<ShortageStatus, StatusTone> = {
  SHORTAGE: "danger",
  AT_RISK: "warning",
  NO_SHORTAGE: "success",
  UNKNOWN: "neutral",
};

export const statusLabel: Record<MaterialRequirement["status"], string> = {
  SHORTAGE: "Shortage",
  INCOMING_COVERS: "Incoming covers",
  TIGHT: "Tight",
  COVERED: "Covered",
};

export const shortageLabel: Record<ShortageStatus, string> = {
  SHORTAGE: "Shortage",
  AT_RISK: "At risk",
  NO_SHORTAGE: "No shortage",
  UNKNOWN: "Unknown",
};

export function formatQty(value: number): string {
  return value.toLocaleString("en-KE", { maximumFractionDigits: 3 });
}

export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function priorityRank(level: MaterialPriorityLevel): number {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[level];
}
