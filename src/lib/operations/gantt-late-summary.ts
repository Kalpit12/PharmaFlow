import { listDeliveryLateOrderIds } from "@/lib/operations/schedule-issue-format";

export type GanttLateSummary = { lateJobs: number; lateOrders: number; lateOrderIds: string[] };

/** Delivery late: same definition for Overview KPI and the Gantt Late tab. */
export function computeGanttLateSummary(
  orders: Array<{
    id: string;
    orderKind: "FIRM" | "PROSPECT";
    dueDate: string;
    routing: {
      operations: Array<{
        id: string;
        status: string;
        plannedStart: string | null;
        plannedEnd: string | null;
        isQcHold: boolean;
      }>;
    };
  }>,
  _activeTimerOperationIds: Set<string>,
  orderPlannedEnd: Map<string, string | null>,
  _now: Date
): GanttLateSummary {
  const lateOrderIds = listDeliveryLateOrderIds(orders, orderPlannedEnd);
  const lateOrderSet = new Set(lateOrderIds);
  let lateJobs = 0;
  for (const order of orders) {
    if (!lateOrderSet.has(order.id)) continue;
    const finishing = [...order.routing.operations]
      .filter((op) => op.plannedEnd)
      .sort((a, b) => new Date(b.plannedEnd!).getTime() - new Date(a.plannedEnd!).getTime())[0];
    if (finishing) lateJobs += 1;
  }
  return { lateJobs, lateOrders: lateOrderIds.length, lateOrderIds };
}

export function finishingOperationIdForLateOrder(
  operations: Array<{ id: string; plannedEnd: string | Date | null }>
): string | null {
  const withEnd = operations.filter((op) => op.plannedEnd);
  if (withEnd.length === 0) return null;
  return [...withEnd].sort(
    (a, b) => new Date(b.plannedEnd!).getTime() - new Date(a.plannedEnd!).getTime()
  )[0]!.id;
}
