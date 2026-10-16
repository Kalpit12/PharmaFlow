import type { RoutingIssue, ScheduledOperation } from "@/lib/operations/routing";
import type { RoutingOrder } from "@/lib/operations/routing";

/**
 * Surfaces deterministic infeasibility after a forward schedule is built.
 * Does not re-run the solver — only explains lateness vs committed due dates.
 */
export function appendDueDateFeasibilityIssues(input: {
  orders: RoutingOrder[];
  operations: ScheduledOperation[];
  issues: RoutingIssue[];
}): RoutingIssue[] {
  const issues = [...input.issues];
  const opsByOrder = new Map<string, ScheduledOperation[]>();
  for (const operation of input.operations) {
    const group = opsByOrder.get(operation.orderId) ?? [];
    group.push(operation);
    opsByOrder.set(operation.orderId, group);
  }

  for (const order of input.orders) {
    const operations = opsByOrder.get(order.id) ?? [];
    const lastEnd = operations.reduce<Date | null>((latest, operation) => {
      if (!operation.plannedEnd) return latest;
      if (!latest || operation.plannedEnd.getTime() > latest.getTime()) return operation.plannedEnd;
      return latest;
    }, null);
    if (!lastEnd) continue;
    if (lastEnd.getTime() > order.dueDate.getTime()) {
      const lateMinutes = Math.ceil((lastEnd.getTime() - order.dueDate.getTime()) / 60_000);
      issues.push({
        operationId: operations[operations.length - 1]?.id ?? order.id,
        orderNumber: order.orderNumber,
        kind: "PAST_DUE",
        detail: `Finite schedule finishes ${lateMinutes} minutes after due date (${order.dueDate.toISOString()}).`,
      });
    }
  }

  return issues;
}

/** Flag scheduled steps whose planned start is before now without shop-floor activity. */
export function appendSlippedStartIssues(input: {
  operations: ScheduledOperation[];
  operationStatusById: Map<string, string>;
  activeTimerOperationIds: Set<string>;
  issues: RoutingIssue[];
  now?: Date;
}): RoutingIssue[] {
  const issues = [...input.issues];
  const now = input.now ?? new Date();
  for (const operation of input.operations) {
    if (!operation.plannedStart) continue;
    const status = input.operationStatusById.get(operation.id) ?? "SCHEDULED";
    if (status === "COMPLETED" || status === "IN_PROGRESS") continue;
    if (input.activeTimerOperationIds.has(operation.id)) continue;
    if (operation.plannedStart.getTime() >= now.getTime()) continue;
    issues.push({
      operationId: operation.id,
      orderNumber: operation.orderNumber,
      kind: "SLIPPED_START",
      detail: `Planned start ${operation.plannedStart.toISOString()} is before now; reschedule or start the job.`,
    });
  }
  return issues;
}
