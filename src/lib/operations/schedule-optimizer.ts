import {
  buildOperationSchedule,
  type PlanningWeights,
  type RoutingIssue,
  type RoutingOrder,
  type RoutingWorkstation,
  type ScheduledOperation,
} from "@/lib/operations/routing";
import type { ChangeoverConstraint, OperationDependency } from "@/lib/operations/routing";

export type OptimizerInput = {
  orders: RoutingOrder[];
  dependencies: OperationDependency[];
  workstations: RoutingWorkstation[];
  changeovers: ChangeoverConstraint[];
  windowStart: Date;
  freezeUntil?: Date | null;
  weights?: PlanningWeights;
};

export type OptimizedScheduleResult = {
  operations: ScheduledOperation[];
  issues: RoutingIssue[];
  objectiveScore: number;
  iterations: number;
  improved: boolean;
};

function totalTardinessMinutes(orders: RoutingOrder[], operations: ScheduledOperation[]): number {
  const lastEndByOrder = new Map<string, Date>();
  for (const operation of operations) {
    if (!operation.plannedEnd) continue;
    const current = lastEndByOrder.get(operation.orderId);
    if (!current || operation.plannedEnd.getTime() > current.getTime()) {
      lastEndByOrder.set(operation.orderId, operation.plannedEnd);
    }
  }
  let tardiness = 0;
  for (const order of orders) {
    const end = lastEndByOrder.get(order.id);
    if (!end) continue;
    if (end.getTime() > order.dueDate.getTime()) {
      tardiness += Math.ceil((end.getTime() - order.dueDate.getTime()) / 60_000);
    }
  }
  return tardiness;
}

export function scoreScheduleObjective(input: {
  orders: RoutingOrder[];
  operations: ScheduledOperation[];
  issues: RoutingIssue[];
  weights?: PlanningWeights;
}): number {
  const weights = input.weights ?? {
    priorityWeight: 40,
    dueDateWeight: 35,
    changeoverWeight: 15,
    utilizationWeight: 10,
    leadTimeWeight: 25,
    onTimeCountWeight: 30,
    customerPriorityWeight: 20,
    similarJobsWeight: 15,
    eligibilityWeight: 10,
  };
  const tardiness = totalTardinessMinutes(input.orders, input.operations);
  const changeover = input.operations.reduce((sum, row) => sum + row.changeoverMinutes, 0);
  const issuePenalty = input.issues.length * 10_000;
  const unscheduled = input.operations.filter((row) => !row.plannedStart).length * 5_000;
  const lateOrderCount = input.orders.filter((order) => {
    const end = input.operations
      .filter((op) => op.orderId === order.id && op.plannedEnd)
      .map((op) => op.plannedEnd!.getTime())
      .reduce((max, t) => Math.max(max, t), 0);
    return end > order.dueDate.getTime();
  }).length;
  const leadSpanMinutes = input.orders.reduce((sum, order) => {
    const ops = input.operations.filter((op) => op.orderId === order.id && op.plannedStart && op.plannedEnd);
    if (ops.length === 0) return sum;
    const start = Math.min(...ops.map((op) => op.plannedStart!.getTime()));
    const end = Math.max(...ops.map((op) => op.plannedEnd!.getTime()));
    return sum + Math.ceil((end - start) / 60_000);
  }, 0);
  return (
    tardiness * Math.max(1, weights.dueDateWeight) +
    changeover * Math.max(1, weights.changeoverWeight) +
    lateOrderCount * Math.max(1, weights.onTimeCountWeight) * 60 +
    leadSpanMinutes * Math.max(1, weights.leadTimeWeight) +
    issuePenalty +
    unscheduled
  );
}

function cloneOrders(orders: RoutingOrder[]): RoutingOrder[] {
  return orders.map((order) => ({
    ...order,
    operations: order.operations.map((operation) => ({ ...operation })),
  }));
}

function swapOrders(orders: RoutingOrder[], a: number, b: number): RoutingOrder[] {
  if (a === b) return orders;
  const next = cloneOrders(orders);
  const temp = next[a];
  next[a] = next[b];
  next[b] = temp;
  return next;
}

function flipResource(orders: RoutingOrder[], orderIndex: number, operationId: string): RoutingOrder[] | null {
  const next = cloneOrders(orders);
  const order = next[orderIndex];
  const operation = order.operations.find((row) => row.id === operationId);
  if (!operation || operation.locked || operation.resources.length < 2) return null;
  const current = operation.workstationId ?? operation.resources.find((r) => r.preferred)?.workstationId;
  const alternate = operation.resources.find((resource) => resource.workstationId !== current);
  if (!alternate) return null;
  operation.workstationId = alternate.workstationId;
  operation.locked = true;
  operation.plannedStart = operation.plannedStart;
  operation.plannedEnd = operation.plannedEnd;
  return next;
}

/**
 * Global improvement pass over the forward heuristic.
 * Explores order permutations and alternate qualified resources until local score plateaus.
 */
export function optimizeOperationSchedule(
  input: OptimizerInput,
  options?: { maxIterations?: number }
): OptimizedScheduleResult {
  const maxIterations =
    options?.maxIterations ??
    (process.env.LAB_ALLIED_RESEED_FAST_OPTIMIZER === "1" ? 48 : 240);
  let bestOrders = cloneOrders(input.orders);
  let best = buildOperationSchedule({ ...input, orders: bestOrders });
  let bestScore = scoreScheduleObjective({
    orders: bestOrders,
    operations: best.operations,
    issues: best.issues,
    weights: input.weights,
  });
  let iterations = 0;
  let improved = false;
  let stall = 0;

  while (iterations < maxIterations && stall < 40) {
    iterations += 1;
    let candidateOrders: RoutingOrder[] | null = null;

    if (iterations % 3 === 0 && bestOrders.length > 1) {
      const a = iterations % bestOrders.length;
      const b = (iterations * 7 + 3) % bestOrders.length;
      candidateOrders = swapOrders(bestOrders, a, b);
    } else {
      const orderIndex = iterations % Math.max(bestOrders.length, 1);
      const order = bestOrders[orderIndex];
      const movable = order?.operations.find((operation) => !operation.locked && operation.resources.length > 1);
      if (order && movable) {
        candidateOrders = flipResource(bestOrders, orderIndex, movable.id);
      }
    }

    if (!candidateOrders) {
      stall += 1;
      continue;
    }

    const candidate = buildOperationSchedule({ ...input, orders: candidateOrders });
    const score = scoreScheduleObjective({
      orders: candidateOrders,
      operations: candidate.operations,
      issues: candidate.issues,
      weights: input.weights,
    });
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
      bestOrders = candidateOrders;
      improved = true;
      stall = 0;
    } else {
      stall += 1;
    }
  }

  return {
    operations: best.operations,
    issues: best.issues,
    objectiveScore: bestScore,
    iterations,
    improved,
  };
}

export function buildOptimizedOperationSchedule(input: OptimizerInput): OptimizedScheduleResult {
  return optimizeOperationSchedule(input);
}
