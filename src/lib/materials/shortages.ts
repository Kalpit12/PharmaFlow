import type { AffectedProductionOrder, MaterialPriorityLevel, ProductionPriorityId } from "@/lib/materials/types";
import { IMMINENT_DUE_DAYS } from "@/lib/materials/types";

export type ShortageStatus = "NO_SHORTAGE" | "AT_RISK" | "SHORTAGE" | "UNKNOWN";

const DAY_MS = 86_400_000;

function requirementDate(order: AffectedProductionOrder): string | null {
  return order.plannedStart ?? order.dueDate ?? null;
}

function parseIso(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeShortageTimeline(input: {
  onHand: number;
  incoming: number;
  grossRequirement: number;
  projectedAvailable: number;
  shortage: boolean;
  affectedOrders: AffectedProductionOrder[];
  now: Date;
}): { status: ShortageStatus; earliestShortageDate: string | null; requirementDate: string | null } {
  const requirementDates = input.affectedOrders
    .map(requirementDate)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));

  const earliestRequirement = requirementDates[0] ?? null;

  if (input.grossRequirement <= 0) {
    return { status: "NO_SHORTAGE", earliestShortageDate: null, requirementDate: earliestRequirement };
  }

  if (input.affectedOrders.length === 0) {
    return { status: "UNKNOWN", earliestShortageDate: null, requirementDate: null };
  }

  if (input.shortage) {
    const sorted = [...input.affectedOrders].sort((a, b) => (requirementDate(a) ?? "").localeCompare(requirementDate(b) ?? ""));
    let balance = roundQty(input.onHand + input.incoming);
    let earliestShortageDate: string | null = null;
    for (const order of sorted) {
      balance = roundQty(balance - order.requiredQuantity);
      const date = parseIso(requirementDate(order));
      if (balance < 0 && date) {
        earliestShortageDate = isoDay(date);
        break;
      }
    }
    if (!earliestShortageDate && input.projectedAvailable < 0) {
      earliestShortageDate = earliestRequirement ? earliestRequirement.slice(0, 10) : null;
    }
    return { status: "SHORTAGE", earliestShortageDate, requirementDate: earliestRequirement };
  }

  if (input.projectedAvailable >= 0 && input.onHand < input.grossRequirement && input.incoming > 0) {
    return { status: "AT_RISK", earliestShortageDate: null, requirementDate: earliestRequirement };
  }

  if (input.grossRequirement > 0 && input.projectedAvailable >= 0 && input.projectedAvailable < input.grossRequirement * 0.1) {
    return { status: "AT_RISK", earliestShortageDate: null, requirementDate: earliestRequirement };
  }

  return { status: "NO_SHORTAGE", earliestShortageDate: null, requirementDate: earliestRequirement };
}

function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  return Math.floor((due.getTime() - now.getTime()) / DAY_MS);
}

function isElevated(priority: ProductionPriorityId): boolean {
  return priority === "HIGH" || priority === "CRITICAL";
}

export function buildMaterialPriority(input: {
  shortage: boolean;
  shortageStatus: ShortageStatus;
  netRequirement: number;
  affectedOrders: AffectedProductionOrder[];
  earliestDueDate: string | null;
  riskRank: number;
  now: Date;
}): { level: MaterialPriorityLevel; reason: string } {
  const elevatedCount = input.affectedOrders.filter((order) => isElevated(order.priority)).length;
  const scheduledCount = input.affectedOrders.filter((order) => order.plannedStart).length;
  const days = daysUntil(input.earliestDueDate, input.now);
  const imminent = days !== null && days <= IMMINENT_DUE_DAYS;

  if (input.shortage && elevatedCount > 0 && imminent) {
    return {
      level: "CRITICAL",
      reason: `Shortage affects ${elevatedCount} high-priority production ${elevatedCount === 1 ? "order" : "orders"} due within ${IMMINENT_DUE_DAYS} days.`,
    };
  }
  if (input.shortage && scheduledCount > 0) {
    return {
      level: "HIGH",
      reason: `Material shortage affects ${scheduledCount} scheduled ${scheduledCount === 1 ? "order" : "orders"}.`,
    };
  }
  if (input.shortage) {
    return {
      level: "HIGH",
      reason: `Confirmed shortage of ${formatQty(input.netRequirement)} against open production demand.`,
    };
  }
  if (input.shortageStatus === "AT_RISK") {
    return {
      level: "MEDIUM",
      reason: input.earliestDueDate
        ? `Projected shortage with requirement date ${formatDay(input.earliestDueDate)}.`
        : "Projected shortage with later requirement timing.",
    };
  }
  if (input.riskRank > 0) {
    return { level: "LOW", reason: "No immediate production impact — monitor coverage." };
  }
  return { level: "LOW", reason: "No immediate production impact." };
}

function formatQty(value: number): string {
  return value.toLocaleString("en-GB", { maximumFractionDigits: 3 });
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function buildShortageHorizon(
  materials: Array<{ productId: string; name: string; shortageStatus: ShortageStatus; earliestShortageDate: string | null; netRequirement: number }>
): Array<{ id: string; label: string; value: number; hint: string }> {
  return materials
    .filter((row) => row.shortageStatus === "SHORTAGE" || row.shortageStatus === "AT_RISK")
    .slice(0, 8)
    .map((row) => ({
      id: row.productId,
      label: row.name,
      value: Math.max(1, Math.round(row.netRequirement)),
      hint: row.earliestShortageDate ?? "Timing unknown",
    }));
}
