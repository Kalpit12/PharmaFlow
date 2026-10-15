import { jobStatusIsLate, resolveJobPlanStatus } from "@/lib/operations/plan-job-status";

export type GanttLateSummary = { lateJobs: number; lateOrders: number };

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
  activeTimerOperationIds: Set<string>,
  orderPlannedEnd: Map<string, string | null>,
  now: Date
): GanttLateSummary {
  let lateJobs = 0;
  const lateOrderIds = new Set<string>();

  for (const order of orders) {
    for (const op of order.routing.operations) {
      const status = resolveJobPlanStatus({
        operationStatus: op.status,
        orderKind: order.orderKind,
        plannedStart: op.plannedStart,
        plannedEnd: op.plannedEnd,
        dueDate: order.dueDate,
        isQcHold: op.isQcHold,
        hasActiveTimer: activeTimerOperationIds.has(op.id),
        orderPlannedEnd: orderPlannedEnd.get(order.id) ?? null,
        now,
      });
      if (jobStatusIsLate(status)) {
        lateJobs += 1;
        lateOrderIds.add(order.id);
      }
    }
  }

  return { lateJobs, lateOrders: lateOrderIds.size };
}
