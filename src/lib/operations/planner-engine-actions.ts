import type { RoutableOperation } from "@/lib/operations/routing";
import type { RoutingOrder } from "@/lib/operations/routing";

/** Clear stale planned times on unstarted ops so the engine can replan from now (Bulldozer). */
export function bulldozePastOperations(
  operations: RoutableOperation[],
  now: Date,
  isStarted: (operationId: string) => boolean
): RoutableOperation[] {
  const nowMs = now.getTime();
  return operations.map((operation) => {
    if (operation.locked || isStarted(operation.id)) return operation;
    if (!operation.plannedStart || operation.plannedStart.getTime() >= nowMs) return operation;
    return {
      ...operation,
      workstationId: null,
      plannedStart: null,
      plannedEnd: null,
    };
  });
}

export function sortOrdersForScheduling(orders: RoutingOrder[]): RoutingOrder[] {
  return [...orders].sort((a, b) => {
    const aFast = a.fastTrack ? 1 : 0;
    const bFast = b.fastTrack ? 1 : 0;
    if (aFast !== bFast) return bFast - aFast;
    return 0;
  });
}

export function operationTouchesWorkstation(
  operation: Pick<RoutableOperation, "workstationId" | "resources">,
  workstationId: string
): boolean {
  if (operation.workstationId === workstationId) return true;
  return operation.resources.some((resource) => resource.workstationId === workstationId);
}

/** Lock every operation not on the scoped workstation (one-line reschedule). */
export function lockOperationsOutsideWorkstationScope(
  operations: RoutableOperation[],
  workstationId: string,
  freezeUntil: Date | null,
  isCommitted: (op: RoutableOperation) => boolean
): RoutableOperation[] {
  return operations.map((operation) => {
    if (isCommitted(operation)) return operation;
    if (operationTouchesWorkstation(operation, workstationId)) return operation;
    return { ...operation, locked: true };
  });
}

export function filterOrdersUnscheduledOnly(orders: RoutingOrder[]): RoutingOrder[] {
  return orders.filter((order) =>
    order.operations.some((operation) => !operation.plannedStart || !operation.plannedEnd)
  );
}
