import {
  addWorkingMinutesOnCalendar,
  alignToCalendar,
  createStandardWorkCalendar,
  type WorkCalendar,
} from "@/lib/operations/calendar";
import { PRIORITY_RANK, type PlannerPriority } from "@/lib/operations/schedule";

export type RoutingWorkstation = {
  id: string;
  code: string;
  capacityHoursPerDay: number;
  calendar?: WorkCalendar;
};

export type QualifiedResource = {
  workstationId: string;
  efficiencyPercent: number;
  preferred: boolean;
};

export type RoutableOperation = {
  id: string;
  orderId: string;
  orderNumber: string;
  sequence: number;
  durationMinutes: number;
  setupMinutes: number;
  teardownMinutes: number;
  changeoverFamily: string | null;
  resources: QualifiedResource[];
  locked: boolean;
  workstationId: string | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
};

export type RoutingOrder = {
  id: string;
  orderNumber: string;
  priority: PlannerPriority;
  dueDate: Date;
  createdAt: Date;
  materialReadyAt?: Date | null;
  materialBlocked?: boolean;
  operations: RoutableOperation[];
};

export type OperationDependency = {
  fromOperationId: string;
  toOperationId: string;
  minimumLagMinutes: number;
};

export type ChangeoverConstraint = {
  id: string;
  workstationId: string | null;
  fromFamily: string;
  toFamily: string;
  durationMinutes: number;
};

export type ScheduledOperation = RoutableOperation & {
  workstationId: string | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  changeoverMinutes: number;
  appliedChangeoverRuleId: string | null;
};

export type RoutingIssue = {
  operationId: string;
  orderNumber: string;
  kind:
    | "NO_QUALIFIED_RESOURCE"
    | "CYCLIC_DEPENDENCY"
    | "INVALID_DURATION"
    | "MATERIAL_UNAVAILABLE";
  detail: string;
};

type ResourceState = {
  availableAt: Date;
  lastFamily: string | null;
};

export type PlanningWeights = {
  priorityWeight: number;
  dueDateWeight: number;
  changeoverWeight: number;
  utilizationWeight: number;
};

const DAY_MS = 86_400_000;

function orderUrgencyScore(order: RoutingOrder, now: Date, weights: PlanningWeights): number {
  const priority = (3 - PRIORITY_RANK[order.priority]) / 3;
  const daysUntilDue = (order.dueDate.getTime() - now.getTime()) / DAY_MS;
  const due = 1 / (1 + Math.max(0, daysUntilDue));
  return weights.priorityWeight * priority + weights.dueDateWeight * due;
}

function compareOrders(a: RoutingOrder, b: RoutingOrder, weights?: PlanningWeights, now?: Date): number {
  if (weights && now) {
    const score = orderUrgencyScore(b, now, weights) - orderUrgencyScore(a, now, weights);
    if (score !== 0) return score;
  } else {
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    const due = a.dueDate.getTime() - b.dueDate.getTime();
    if (due !== 0) return due;
  }
  const created = a.createdAt.getTime() - b.createdAt.getTime();
  if (created !== 0) return created;
  return a.id.localeCompare(b.id);
}

export function isOperationFrozen(
  operation: Pick<RoutableOperation, "plannedStart">,
  freezeUntil?: Date | null
): boolean {
  if (!freezeUntil || !operation.plannedStart) return false;
  return operation.plannedStart.getTime() < freezeUntil.getTime();
}

function later(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function resolveChangeover(
  constraints: ChangeoverConstraint[],
  workstationId: string,
  fromFamily: string | null,
  toFamily: string | null
): ChangeoverConstraint | null {
  if (!fromFamily || !toFamily || fromFamily === toFamily) return null;
  return (
    constraints.find(
      (rule) =>
        rule.workstationId === workstationId &&
        rule.fromFamily === fromFamily &&
        rule.toFamily === toFamily
    ) ??
    constraints.find(
      (rule) =>
        rule.workstationId === null &&
        rule.fromFamily === fromFamily &&
        rule.toFamily === toFamily
    ) ??
    null
  );
}

/**
 * Deterministic finite-capacity operation scheduler.
 *
 * It only chooses workstations explicitly qualified for an operation, respects
 * predecessor completion/lag, and includes setup, teardown, efficiency, and
 * sequence-dependent changeover time in the reserved workstation window.
 */
export function buildOperationSchedule(input: {
  orders: RoutingOrder[];
  dependencies: OperationDependency[];
  workstations: RoutingWorkstation[];
  changeovers: ChangeoverConstraint[];
  windowStart: Date;
  freezeUntil?: Date | null;
  weights?: PlanningWeights;
}): { operations: ScheduledOperation[]; issues: RoutingIssue[] } {
  const workstationById = new Map(input.workstations.map((row) => [row.id, row]));
  const resourceState = new Map<string, ResourceState>();
  for (const workstation of input.workstations) {
    const calendar = workstation.calendar ?? createStandardWorkCalendar(workstation.capacityHoursPerDay);
    resourceState.set(workstation.id, {
      availableAt: alignToCalendar(input.windowStart, calendar),
      lastFamily: null,
    });
  }

  const result: ScheduledOperation[] = [];
  const resultById = new Map<string, ScheduledOperation>();
  const issues: RoutingIssue[] = [];

  for (const order of input.orders.slice().sort((a, b) => compareOrders(a, b, input.weights, input.windowStart))) {
    if (order.materialBlocked) {
      for (const operation of order.operations) {
        const unscheduled: ScheduledOperation = {
          ...operation,
          workstationId: null,
          plannedStart: null,
          plannedEnd: null,
          changeoverMinutes: 0,
          appliedChangeoverRuleId: null,
        };
        result.push(unscheduled);
        resultById.set(unscheduled.id, unscheduled);
        issues.push({
          operationId: operation.id,
          orderNumber: order.orderNumber,
          kind: "MATERIAL_UNAVAILABLE",
          detail: "Dated material supply cannot cover this production order.",
        });
      }
      continue;
    }

    const pending = new Map(order.operations.map((operation) => [operation.id, operation]));
    const operationIds = new Set(order.operations.map((operation) => operation.id));
    const orderDependencies = input.dependencies.filter(
      (dependency) =>
        operationIds.has(dependency.fromOperationId) && operationIds.has(dependency.toOperationId)
    );

    while (pending.size > 0) {
      const ready = [...pending.values()]
        .filter((operation) =>
          orderDependencies
            .filter((dependency) => dependency.toOperationId === operation.id)
            .every((dependency) => resultById.has(dependency.fromOperationId))
        )
        .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));

      if (ready.length === 0) {
        for (const operation of pending.values()) {
          issues.push({
            operationId: operation.id,
            orderNumber: order.orderNumber,
            kind: "CYCLIC_DEPENDENCY",
            detail: "Operation dependencies contain a cycle or unresolved predecessor.",
          });
        }
        break;
      }

      for (const operation of ready) {
        pending.delete(operation.id);

        if (operation.durationMinutes <= 0) {
          issues.push({
            operationId: operation.id,
            orderNumber: order.orderNumber,
            kind: "INVALID_DURATION",
            detail: "Operation duration must be greater than zero.",
          });
        }

        const frozen = isOperationFrozen(operation, input.freezeUntil);
        if ((operation.locked || frozen) && operation.workstationId && operation.plannedStart && operation.plannedEnd) {
          const lockedWorkstationId = operation.workstationId;
          const lockedEnd = operation.plannedEnd;
          const locked: ScheduledOperation = {
            ...operation,
            changeoverMinutes: 0,
            appliedChangeoverRuleId: null,
          };
          result.push(locked);
          resultById.set(locked.id, locked);
          const state = resourceState.get(lockedWorkstationId);
          if (state && lockedEnd.getTime() > state.availableAt.getTime()) {
            state.availableAt = lockedEnd;
            state.lastFamily = locked.changeoverFamily;
          }
          continue;
        }

        let predecessorReady =
          order.materialReadyAt && order.materialReadyAt.getTime() > input.windowStart.getTime()
            ? order.materialReadyAt
            : input.windowStart;
        for (const dependency of orderDependencies.filter(
          (candidate) => candidate.toOperationId === operation.id
        )) {
          const predecessor = resultById.get(dependency.fromOperationId);
          if (!predecessor?.plannedEnd) continue;
          predecessorReady = later(
            predecessorReady,
            new Date(predecessor.plannedEnd.getTime() + dependency.minimumLagMinutes * 60_000)
          );
        }

        const candidates = operation.resources
          .filter((resource) => workstationById.has(resource.workstationId))
          .map((resource) => {
            const workstation = workstationById.get(resource.workstationId)!;
            const calendar =
              workstation.calendar ?? createStandardWorkCalendar(workstation.capacityHoursPerDay);
            const state = resourceState.get(resource.workstationId)!;
            const rule = resolveChangeover(
              input.changeovers,
              resource.workstationId,
              state.lastFamily,
              operation.changeoverFamily
            );
            const changeoverMinutes = rule?.durationMinutes ?? 0;
            const runMinutes = Math.ceil(
              Math.max(0, operation.durationMinutes) * (100 / Math.max(1, resource.efficiencyPercent))
            );
            const totalMinutes =
              operation.setupMinutes + changeoverMinutes + runMinutes + operation.teardownMinutes;
            const start = alignToCalendar(later(state.availableAt, predecessorReady), calendar);
            const end = addWorkingMinutesOnCalendar(start, totalMinutes, calendar);
            return { resource, start, end, rule, changeoverMinutes };
          })
          .sort((a, b) => {
            const weights = input.weights;
            if (!weights) {
              return (
                a.end.getTime() - b.end.getTime() ||
                Number(b.resource.preferred) - Number(a.resource.preferred) ||
                a.resource.workstationId.localeCompare(b.resource.workstationId)
              );
            }
            const score = (candidate: typeof a) =>
              candidate.end.getTime() +
              weights.changeoverWeight * candidate.changeoverMinutes * 60_000 -
              weights.utilizationWeight * (candidate.resource.preferred ? 1 : 0) * 300_000 -
              weights.utilizationWeight * candidate.resource.efficiencyPercent * 1_000;
            return (
              score(a) - score(b) ||
              Number(b.resource.preferred) - Number(a.resource.preferred) ||
              a.resource.workstationId.localeCompare(b.resource.workstationId)
            );
          });

        const selected = candidates[0];
        if (!selected) {
          const unscheduled: ScheduledOperation = {
            ...operation,
            workstationId: null,
            plannedStart: null,
            plannedEnd: null,
            changeoverMinutes: 0,
            appliedChangeoverRuleId: null,
          };
          result.push(unscheduled);
          resultById.set(unscheduled.id, unscheduled);
          issues.push({
            operationId: operation.id,
            orderNumber: order.orderNumber,
            kind: "NO_QUALIFIED_RESOURCE",
            detail: "No active workstation is qualified for this operation.",
          });
          continue;
        }

        const scheduled: ScheduledOperation = {
          ...operation,
          workstationId: selected.resource.workstationId,
          plannedStart: selected.start,
          plannedEnd: selected.end,
          changeoverMinutes: selected.changeoverMinutes,
          appliedChangeoverRuleId: selected.rule?.id ?? null,
        };
        result.push(scheduled);
        resultById.set(scheduled.id, scheduled);
        resourceState.set(selected.resource.workstationId, {
          availableAt: selected.end,
          lastFamily: operation.changeoverFamily,
        });
      }
    }
  }

  return { operations: result, issues };
}
