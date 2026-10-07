import type { ScheduledOperation } from "@/lib/operations/routing";

export type ProposalOrderSnapshot = {
  id: string;
  orderNumber: string;
  dueDate: Date;
  previousStart: Date | null;
  previousEnd: Date | null;
  previousWorkstationId: string | null;
  materialState: string;
  isLocked: boolean;
};

export type ProposedOrderChange = {
  productionOrderId: string;
  orderNumber: string;
  proposedWorkstationId: string | null;
  proposedStart: Date | null;
  proposedEnd: Date | null;
  previousStart: Date | null;
  previousEnd: Date | null;
  materialState: string;
  isLocked: boolean;
  changeMinutes: number;
  deliveryDeltaMinutes: number;
};

export type ProposalSummary = {
  movedOrders: number;
  lockedOrders: number;
  blockedOrders: number;
  lateOrders: number;
  unscheduledOrders: number;
  totalChangeoverMinutes: number;
  freezeUntil: string | null;
  text: string;
};

export function rollupOrderFromOperations(operations: ScheduledOperation[]): {
  workstationId: string | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
} {
  const scheduled = operations.filter((operation) => operation.plannedStart && operation.plannedEnd);
  if (scheduled.length === 0) {
    return { workstationId: null, plannedStart: null, plannedEnd: null };
  }
  const plannedStart = scheduled.reduce(
    (earliest, operation) =>
      !earliest || operation.plannedStart!.getTime() < earliest.getTime() ? operation.plannedStart : earliest,
    scheduled[0]?.plannedStart ?? null
  );
  const plannedEnd = scheduled.reduce(
    (latest, operation) =>
      !latest || operation.plannedEnd!.getTime() > latest.getTime() ? operation.plannedEnd : latest,
    scheduled[0]?.plannedEnd ?? null
  );
  const first = [...scheduled].sort((a, b) => a.sequence - b.sequence)[0];
  return {
    workstationId: first?.workstationId ?? null,
    plannedStart,
    plannedEnd,
  };
}

export function buildProposedOrderChanges(input: {
  orders: ProposalOrderSnapshot[];
  operations: ScheduledOperation[];
  freezeUntil?: Date | null;
}): ProposedOrderChange[] {
  const operationsByOrder = new Map<string, ScheduledOperation[]>();
  for (const operation of input.operations) {
    const group = operationsByOrder.get(operation.orderId) ?? [];
    group.push(operation);
    operationsByOrder.set(operation.orderId, group);
  }

  return input.orders.map((order) => {
    const operations = operationsByOrder.get(order.id) ?? [];
    const rolled = rollupOrderFromOperations(operations);
    const frozen =
      order.isLocked ||
      (Boolean(input.freezeUntil) &&
        Boolean(order.previousStart) &&
        order.previousStart!.getTime() < input.freezeUntil!.getTime());
    const changeMinutes =
      order.previousStart && rolled.plannedStart
        ? Math.round((rolled.plannedStart.getTime() - order.previousStart.getTime()) / 60_000)
        : 0;
    const deliveryDeltaMinutes = rolled.plannedEnd
      ? Math.round((rolled.plannedEnd.getTime() - order.dueDate.getTime()) / 60_000)
      : 0;
    return {
      productionOrderId: order.id,
      orderNumber: order.orderNumber,
      proposedWorkstationId: rolled.workstationId,
      proposedStart: rolled.plannedStart,
      proposedEnd: rolled.plannedEnd,
      previousStart: order.previousStart,
      previousEnd: order.previousEnd,
      materialState: order.materialState,
      isLocked: order.isLocked || frozen,
      changeMinutes,
      deliveryDeltaMinutes,
    };
  });
}

export function summarizeProposal(input: {
  orders: ProposedOrderChange[];
  operations: ScheduledOperation[];
  freezeUntil?: Date | null;
}): ProposalSummary {
  const movedOrders = input.orders.filter((order) => {
    if (order.isLocked || !order.proposedStart) return false;
    if (!order.previousStart) return true;
    return (
      order.changeMinutes !== 0 ||
      (order.previousEnd?.getTime() ?? 0) !== (order.proposedEnd?.getTime() ?? 0)
    );
  }).length;
  const lockedOrders = input.orders.filter((order) => order.isLocked).length;
  const blockedOrders = input.orders.filter((order) => order.materialState === "BLOCKED").length;
  const lateOrders = input.orders.filter((order) => order.deliveryDeltaMinutes > 0 && order.proposedEnd).length;
  const unscheduledOrders = input.orders.filter((order) => !order.proposedStart).length;
  const totalChangeoverMinutes = input.operations.reduce((sum, operation) => sum + operation.changeoverMinutes, 0);
  const text = [
    `${movedOrders} unlocked ${movedOrders === 1 ? "order" : "orders"} would move`,
    `${lockedOrders} remain frozen or locked`,
    `${lateOrders} finish after the due date`,
    totalChangeoverMinutes > 0 ? `${totalChangeoverMinutes} min changeover reserved` : null,
    blockedOrders > 0 ? `${blockedOrders} blocked by materials` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    movedOrders,
    lockedOrders,
    blockedOrders,
    lateOrders,
    unscheduledOrders,
    totalChangeoverMinutes,
    freezeUntil: input.freezeUntil?.toISOString() ?? null,
    text,
  };
}
