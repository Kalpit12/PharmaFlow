import type { OperationDependency, RoutingIssue, RoutingOrder, ScheduledOperation } from "@/lib/operations/routing";

type OperationMeta = {
  maxHoldHours: number | null;
};

/**
 * After forward scheduling, flag steps that exceed routing max hold time since predecessor end.
 */
export function appendMaxHoldIssues(input: {
  orders: RoutingOrder[];
  dependencies: OperationDependency[];
  operations: ScheduledOperation[];
  operationMeta: Map<string, OperationMeta>;
  issues: RoutingIssue[];
}): RoutingIssue[] {
  const byId = new Map(input.operations.map((row) => [row.id, row]));
  const orderByNumber = new Map(input.orders.map((row) => [row.id, row.orderNumber]));
  const nextIssues = [...input.issues];

  for (const dependency of input.dependencies) {
    const from = byId.get(dependency.fromOperationId);
    const to = byId.get(dependency.toOperationId);
    if (!from?.plannedEnd || !to?.plannedStart) continue;
    const meta = input.operationMeta.get(dependency.toOperationId);
    const maxHoldHours = meta?.maxHoldHours;
    if (!maxHoldHours || maxHoldHours <= 0) continue;

    const holdMinutes = (to.plannedStart.getTime() - from.plannedEnd.getTime()) / 60_000;
    const maxMinutes = maxHoldHours * 60;
    if (holdMinutes > maxMinutes + 0.5) {
      nextIssues.push({
        operationId: to.id,
        orderNumber: orderByNumber.get(to.orderId) ?? to.orderNumber,
        kind: "MAX_HOLD_EXCEEDED",
        detail: `Gap ${Math.round(holdMinutes)} min exceeds max hold ${maxHoldHours} h after prior step.`,
      });
    }
  }

  return nextIssues;
}
