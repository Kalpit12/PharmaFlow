import type { ProposedOrderChange } from "@/lib/operations/proposal";
import type { ScheduledOperation } from "@/lib/operations/routing";
import { isOperationFrozen } from "@/lib/operations/routing";

export type OperationMoveSnapshot = {
  productionOperationId: string;
  orderNumber: string;
  previousStart: string | null;
  previousEnd: string | null;
  previousWorkstationId: string | null;
  proposedStart: string | null;
  proposedEnd: string | null;
  proposedWorkstationId: string | null;
  changeoverMinutes: number;
  moved: boolean;
};

export function operationProposalMoved(input: {
  previousStart: Date | null;
  previousEnd: Date | null;
  previousWorkstationId: string | null;
  proposedStart: Date | null;
  proposedEnd: Date | null;
  proposedWorkstationId: string | null;
}): boolean {
  if (!input.proposedStart || !input.proposedEnd || !input.proposedWorkstationId) return false;
  if (!input.previousStart || !input.previousEnd || !input.previousWorkstationId) return true;
  return (
    input.previousWorkstationId !== input.proposedWorkstationId ||
    input.previousStart.getTime() !== input.proposedStart.getTime() ||
    input.previousEnd.getTime() !== input.proposedEnd.getTime()
  );
}

export function countMovedOperations(moves: OperationMoveSnapshot[]): number {
  return moves.filter((row) => row.moved).length;
}

export type LockBreakdown = {
  manualOrderLocks: number;
  manualOperationLocks: number;
  inProgressOrPaused: number;
  completedFrozen: number;
  runningTimeLockFrozen: number;
  /** Orders with at least one committed op (for UI copy). */
  ordersWithCommittedOps: number;
};

export function summarizeLockBreakdown(input: {
  orders: Array<{ id: string; isLocked: boolean }>;
  operations: Array<{
    productionOrderId: string;
    isLocked: boolean;
    status: string;
    plannedStart: Date | null;
  }>;
  freezeUntil: Date | null;
}): LockBreakdown {
  const orderLocked = new Set(input.orders.filter((o) => o.isLocked).map((o) => o.id));
  let manualOperationLocks = 0;
  let inProgressOrPaused = 0;
  let completedFrozen = 0;
  let runningTimeLockFrozen = 0;
  const ordersWithCommitted = new Set<string>();

  for (const op of input.operations) {
    let committed = false;
    if (orderLocked.has(op.productionOrderId) || op.isLocked) {
      if (op.isLocked) manualOperationLocks += 1;
      committed = true;
    }
    if (op.status === "IN_PROGRESS" || op.status === "PAUSED") {
      inProgressOrPaused += 1;
      committed = true;
    }
    if (op.status === "COMPLETED") {
      completedFrozen += 1;
      committed = true;
    }
    if (
      input.freezeUntil &&
      isOperationFrozen({ plannedStart: op.plannedStart }, input.freezeUntil)
    ) {
      runningTimeLockFrozen += 1;
      committed = true;
    }
    if (committed) ordersWithCommitted.add(op.productionOrderId);
  }

  return {
    manualOrderLocks: orderLocked.size,
    manualOperationLocks,
    inProgressOrPaused,
    completedFrozen,
    runningTimeLockFrozen,
    ordersWithCommittedOps: ordersWithCommitted.size,
  };
}

export function summarizeProposalFromOperations(input: {
  orderChanges: ProposedOrderChange[];
  operations: ScheduledOperation[];
  operationMoves: OperationMoveSnapshot[];
  freezeUntil?: Date | null;
}): {
  movedOperations: number;
  movedOrders: number;
  lockedOrders: number;
  blockedOrders: number;
  lateOrders: number;
  totalChangeoverMinutes: number;
  lockBreakdown: LockBreakdown;
} {
  const movedOperations = countMovedOperations(input.operationMoves);
  const movedOrders = input.orderChanges.filter((order) => {
    if (order.isLocked || !order.proposedStart) return false;
    if (!order.previousStart) return true;
    return order.changeMinutes !== 0 || order.previousEnd?.getTime() !== order.proposedEnd?.getTime();
  }).length;
  const lockedOrders = input.orderChanges.filter((order) => order.isLocked).length;
  const blockedOrders = input.orderChanges.filter((order) => order.materialState === "BLOCKED").length;
  const lateOrders = input.orderChanges.filter(
    (order) => order.deliveryDeltaMinutes > 0 && order.proposedEnd
  ).length;
  const totalChangeoverMinutes = input.operations.reduce(
    (sum, operation) => sum + operation.changeoverMinutes,
    0
  );

  const lockBreakdown = summarizeLockBreakdown({
    orders: input.orderChanges.map((row) => ({
      id: row.productionOrderId,
      isLocked: row.isLocked,
    })),
    operations: input.operations.map((op) => ({
      productionOrderId: op.orderId,
      isLocked: op.locked,
      status: "UNSCHEDULED",
      plannedStart: op.plannedStart,
    })),
    freezeUntil: input.freezeUntil ?? null,
  });

  return {
    movedOperations,
    movedOrders,
    lockedOrders,
    blockedOrders,
    lateOrders,
    totalChangeoverMinutes,
    lockBreakdown,
  };
}
