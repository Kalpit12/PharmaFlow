import { jobStatusIsLate, resolveJobPlanStatus } from "@/lib/operations/plan-job-status";
import { countDeliveryLateOrders } from "@/lib/operations/schedule-issue-format";

export type GanttLateSummary = { lateJobs: number; lateOrders: number };

/** Delivery late: shared by Gantt Late tab, Execution at-risk KPI, and planner overview. */
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
      if (jobStatusIsLate(status)) lateJobs += 1;
    }
  }

  const lateOrders = countDeliveryLateOrders(orders, orderPlannedEnd, activeTimerOperationIds, now);
  return { lateJobs, lateOrders };
}
