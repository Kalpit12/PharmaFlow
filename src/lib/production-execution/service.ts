import type {
  ExecutionAttentionItem,
  ExecutionAuditAction,
  ExecutionHistoryEntry,
  ExecutionOrderRow,
  ExecutionRisk,
  ExecutionState,
} from "@/lib/production-execution/types";
import { EXECUTION_AUDIT_ACTIONS } from "@/lib/production-execution/types";

export type ExecutionOverlayInput = {
  planningStatus: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  workstationId: string | null;
  workstationActive: boolean | null;
  plannedQuantity: number;
  producedQuantity: number | null;
  productionStartedAt: Date | null;
  productionCompletedAt: Date | null;
  history: Array<{ action: string; createdAt: Date }>;
  now?: Date;
};

export function isExecutionAuditAction(action: string): action is ExecutionAuditAction {
  return (EXECUTION_AUDIT_ACTIONS as readonly string[]).includes(action);
}

export function executionActionLabel(action: ExecutionAuditAction): string {
  switch (action) {
    case "PRODUCTION_RELEASE":
      return "Released";
    case "PRODUCTION_START":
      return "Started";
    case "PRODUCTION_PAUSE":
      return "Paused";
    case "PRODUCTION_RESUME":
      return "Resumed";
    case "PRODUCTION_COMPLETE":
      return "Completed";
  }
}

export function deriveIsReleased(history: Array<{ action: string }>): boolean {
  return history.some((row) => row.action === "PRODUCTION_RELEASE");
}

export function deriveIsPaused(history: Array<{ action: string }>): boolean {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const action = history[i]?.action;
    if (action === "PRODUCTION_PAUSE") return true;
    if (action === "PRODUCTION_RESUME" || action === "PRODUCTION_COMPLETE") return false;
  }
  return false;
}

/**
 * Execution state is layered on planning status.
 * RELEASED / PAUSED are AuditLog-derived — they are not ProductionOrderStatus values.
 */
export function deriveExecutionState(input: ExecutionOverlayInput): ExecutionState {
  if (input.planningStatus === "COMPLETED") return "COMPLETED";
  if (input.planningStatus === "IN_PROGRESS") {
    return deriveIsPaused(input.history) ? "PAUSED" : "IN_PROGRESS";
  }
  if (
    (input.planningStatus === "SCHEDULED" || input.planningStatus === "AT_RISK") &&
    deriveIsReleased(input.history)
  ) {
    return "RELEASED";
  }
  return "WAITING";
}

export function computeProgress(plannedQuantity: number, producedQuantity: number | null): {
  remainingQuantity: number | null;
  progressPercent: number | null;
  progressLabel: string;
  quantityVariance: number | null;
} {
  if (producedQuantity == null) {
    return {
      remainingQuantity: null,
      progressPercent: null,
      progressLabel: "Progress not recorded",
      quantityVariance: null,
    };
  }
  if (plannedQuantity <= 0) {
    return {
      remainingQuantity: null,
      progressPercent: null,
      progressLabel: "Invalid planned quantity",
      quantityVariance: null,
    };
  }
  const remaining = Math.max(0, plannedQuantity - producedQuantity);
  const percent = Math.min(100, Math.round((producedQuantity / plannedQuantity) * 100));
  return {
    remainingQuantity: remaining,
    progressPercent: percent,
    progressLabel: `${producedQuantity.toLocaleString("en-GB")} / ${plannedQuantity.toLocaleString("en-GB")} · ${percent}%`,
    quantityVariance: producedQuantity - plannedQuantity,
  };
}

export function computeDurations(input: {
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualCompletion: Date | null;
  now: Date;
  executionState: ExecutionState;
}): {
  plannedDurationMinutes: number | null;
  actualDurationMinutes: number | null;
  durationVarianceMinutes: number | null;
} {
  const plannedDurationMinutes =
    input.plannedStart && input.plannedEnd
      ? Math.max(0, Math.round((input.plannedEnd.getTime() - input.plannedStart.getTime()) / 60000))
      : null;

  let actualDurationMinutes: number | null = null;
  if (input.actualStart && input.actualCompletion) {
    actualDurationMinutes = Math.max(
      0,
      Math.round((input.actualCompletion.getTime() - input.actualStart.getTime()) / 60000)
    );
  } else if (input.actualStart && (input.executionState === "IN_PROGRESS" || input.executionState === "PAUSED")) {
    actualDurationMinutes = Math.max(0, Math.round((input.now.getTime() - input.actualStart.getTime()) / 60000));
  }

  const durationVarianceMinutes =
    plannedDurationMinutes != null && actualDurationMinutes != null
      ? actualDurationMinutes - plannedDurationMinutes
      : null;

  return { plannedDurationMinutes, actualDurationMinutes, durationVarianceMinutes };
}

export function resolveActualStart(
  productionStartedAt: Date | null,
  history: Array<{ action: string; createdAt: Date }>
): Date | null {
  if (productionStartedAt) return productionStartedAt;
  const start = history.find((row) => row.action === "PRODUCTION_START");
  return start?.createdAt ?? null;
}

export function resolveActualCompletion(
  productionCompletedAt: Date | null,
  history: Array<{ action: string; createdAt: Date }>
): Date | null {
  if (productionCompletedAt) return productionCompletedAt;
  const complete = [...history].reverse().find((row) => row.action === "PRODUCTION_COMPLETE");
  return complete?.createdAt ?? null;
}

export function computeExecutionRisk(input: ExecutionOverlayInput & { executionState: ExecutionState }): {
  risk: ExecutionRisk;
  evidence: string;
} {
  const now = input.now ?? new Date();

  if (input.plannedQuantity <= 0) {
    return { risk: "BLOCKED", evidence: "Planned quantity is invalid." };
  }
  if (!input.workstationId) {
    return { risk: "BLOCKED", evidence: "No workstation assigned." };
  }
  if (input.workstationActive === false) {
    return { risk: "BLOCKED", evidence: "Assigned workstation is inactive." };
  }
  if (!input.plannedStart || !input.plannedEnd) {
    return { risk: "UNKNOWN", evidence: "Planned start or end is missing." };
  }
  if (input.executionState === "COMPLETED") {
    return { risk: "ON_TRACK", evidence: "Production order is completed." };
  }
  if (input.executionState === "PAUSED") {
    return { risk: "AT_RISK", evidence: "Production order is paused." };
  }
  if (input.plannedEnd.getTime() < now.getTime()) {
    return { risk: "LATE", evidence: "Production order has passed its planned end and remains incomplete." };
  }

  const actualStart = resolveActualStart(input.productionStartedAt, input.history);
  if (
    input.executionState === "IN_PROGRESS" &&
    actualStart &&
    input.plannedStart &&
    input.plannedEnd
  ) {
    const plannedMs = input.plannedEnd.getTime() - input.plannedStart.getTime();
    const elapsedMs = now.getTime() - actualStart.getTime();
    if (plannedMs > 0 && elapsedMs > plannedMs) {
      return { risk: "AT_RISK", evidence: "Active order has exceeded its planned duration." };
    }
  }

  if (
    input.executionState === "WAITING" ||
    input.executionState === "RELEASED" ||
    input.executionState === "IN_PROGRESS"
  ) {
    const remainingMs = input.plannedEnd.getTime() - now.getTime();
    const plannedMs = input.plannedEnd.getTime() - input.plannedStart.getTime();
    if (plannedMs > 0 && remainingMs > 0 && remainingMs < plannedMs * 0.15) {
      return { risk: "AT_RISK", evidence: "Remaining time to planned end is tight." };
    }
  }

  return { risk: "ON_TRACK", evidence: "Within planned window." };
}

export function allowedActions(state: ExecutionState): {
  canRelease: boolean;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canComplete: boolean;
} {
  return {
    canRelease: state === "WAITING",
    canStart: state === "RELEASED",
    canPause: state === "IN_PROGRESS",
    canResume: state === "PAUSED",
    canComplete: state === "IN_PROGRESS" || state === "PAUSED",
  };
}

export function validateProducedQuantity(
  producedQuantity: number | null | undefined,
  plannedQuantity: number,
  requireQuantity: boolean
): string | null {
  if (!requireQuantity) return null;
  if (producedQuantity == null || Number.isNaN(producedQuantity)) {
    return "Produced quantity is required to complete this order.";
  }
  if (!Number.isInteger(producedQuantity)) {
    return "Produced quantity must be a whole number.";
  }
  if (producedQuantity < 0) {
    return "Produced quantity cannot be negative.";
  }
  if (producedQuantity > plannedQuantity) {
    return "Produced quantity cannot exceed planned quantity.";
  }
  return null;
}

export function buildExecutionAttention(
  orders: Array<Pick<ExecutionOrderRow, "id" | "orderNumber" | "executionState" | "risk" | "riskEvidence" | "workstationId">>
): ExecutionAttentionItem[] {
  const items: ExecutionAttentionItem[] = [];

  for (const order of orders) {
    if (order.risk === "LATE") {
      items.push({
        id: `late-${order.id}`,
        severity: "CRITICAL",
        title: `${order.orderNumber} is past planned completion.`,
        detail: order.riskEvidence,
        consequence: "Shop-floor recovery or replanning decision is required.",
        href: `/execution/production?order=${order.id}`,
      });
    } else if (order.executionState === "PAUSED") {
      items.push({
        id: `paused-${order.id}`,
        severity: "HIGH",
        title: `${order.orderNumber} is paused.`,
        detail: order.riskEvidence,
        consequence: "Active production is interrupted until resumed or completed.",
        href: `/execution/production?order=${order.id}`,
      });
    } else if (!order.workstationId) {
      items.push({
        id: `ws-${order.id}`,
        severity: "HIGH",
        title: `${order.orderNumber} has no workstation assigned.`,
        detail: "Execution cannot proceed without a line assignment.",
        consequence: "Assign a workstation in Operations before release or start.",
        href: `/execution/production?order=${order.id}`,
      });
    } else if (order.risk === "AT_RISK" || order.risk === "BLOCKED") {
      items.push({
        id: `risk-${order.id}`,
        severity: order.risk === "BLOCKED" ? "HIGH" : "MEDIUM",
        title: `${order.orderNumber} needs attention.`,
        detail: order.riskEvidence,
        consequence: "Inspect execution state before the window slips further.",
        href: `/execution/production?order=${order.id}`,
      });
    }
  }

  const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
  return items.sort((a, b) => rank[b.severity] - rank[a.severity]).slice(0, 8);
}

export function mapHistoryEntries(
  rows: Array<{
    id: string;
    action: string;
    oldValue: string | null;
    newValue: string | null;
    reason: string | null;
    createdAt: Date;
    actor: { name: string | null } | null;
  }>
): ExecutionHistoryEntry[] {
  return rows
    .filter((row) => isExecutionAuditAction(row.action))
    .map((row) => ({
      id: row.id,
      action: row.action as ExecutionAuditAction,
      label: executionActionLabel(row.action as ExecutionAuditAction),
      actorName: row.actor?.name ?? null,
      at: row.createdAt.toISOString(),
      oldValue: row.oldValue,
      newValue: row.newValue,
      reason: row.reason,
    }));
}
