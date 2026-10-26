import { isQaHoldOperation } from "@/lib/operations/elapsed-workstation";
import { routingStepDisplayName } from "@/lib/operations/routing-step-labels";

export type ShopFloorOperationRef = {
  id: string;
  operationCode: string;
  operationName?: string | null;
  status: string;
  sequence: number;
  workstationId: string | null;
};

/** Current op = open timer (START/PAUSE/RESUME), else IN_PROGRESS, else next SCHEDULED. */
export function resolveCurrentShopFloorOperation<T extends ShopFloorOperationRef>(
  operations: T[],
  openTimerOperationIds: ReadonlySet<string>
): T | null {
  const sorted = [...operations].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  const withOpenTimer = sorted.find((op) => openTimerOperationIds.has(op.id));
  if (withOpenTimer) return withOpenTimer;
  const inProgress = sorted.find((op) => op.status === "IN_PROGRESS" || op.status === "PAUSED");
  if (inProgress) return inProgress;
  const scheduled = sorted.find((op) => op.status === "SCHEDULED");
  if (scheduled) return scheduled;
  return sorted.find((op) => op.status !== "COMPLETED") ?? sorted[0] ?? null;
}

export function shopFloorStepLabel(op: { operationCode: string; operationName?: string | null } | null): string {
  if (!op) return "—";
  if (isQaHoldOperation(op.operationCode)) return "QA release";
  return routingStepDisplayName(op.operationCode, op.operationName);
}
