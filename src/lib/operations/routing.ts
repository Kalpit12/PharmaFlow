import {
  addWorkingMinutesOnCalendar,
  alignToCalendar,
  createStandardWorkCalendar,
  type WorkCalendar,
} from "@/lib/operations/calendar";
import {
  DEFAULT_SEGREGATION_CLEAN_MINUTES,
  segregationTransitionRequiresClean,
  syntheticSegregationRuleId,
} from "@/lib/operations/changeover-segregation";
import { appendMaxHoldIssues } from "@/lib/operations/gmp-schedule-validation";
import { appendDueDateFeasibilityIssues } from "@/lib/operations/schedule-feasibility";
import { PRIORITY_RANK, type PlannerPriority } from "@/lib/operations/schedule";
import {
  canScheduleOnWorkstation,
  gmpCleanMinutesBeforeJob,
  type WorkstationGmpProfile,
} from "@/lib/operations/workstation-gmp";

export type RoutingWorkstation = {
  id: string;
  code: string;
  capacityHoursPerDay: number;
  calendar?: WorkCalendar;
  gmp?: WorkstationGmpProfile;
  /** Smallest max campaign length (batches) before forced major clean on this line. */
  maxCampaignBatches?: number | null;
};

export type QualifiedResource = {
  workstationId: string;
  efficiencyPercent: number;
  preferred: boolean;
  resourceRole?: "STANDARD" | "ALTERNATE" | "SUBCONTRACT";
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
  isQcHold?: boolean;
  maxHoldHours?: number | null;
};

export type RoutingOrder = {
  id: string;
  orderNumber: string;
  priority: PlannerPriority;
  customerPriority?: PlannerPriority | null;
  dueDate: Date;
  createdAt: Date;
  earliestStartAt?: Date | null;
  fastTrack?: boolean;
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
    | "MATERIAL_UNAVAILABLE"
    | "PAST_DUE"
    | "MAX_HOLD_EXCEEDED"
    | "WORKSTATION_GMP";
  detail: string;
};

type ResourceState = {
  availableAt: Date;
  lastFamily: string | null;
  batchesSinceClean: number;
};

const DEFAULT_CAMPAIGN_MAJOR_CLEAN_MINUTES = 120;

export type PlanningWeights = {
  priorityWeight: number;
  dueDateWeight: number;
  changeoverWeight: number;
  utilizationWeight: number;
  leadTimeWeight: number;
  onTimeCountWeight: number;
  customerPriorityWeight: number;
  similarJobsWeight: number;
  eligibilityWeight: number;
};

const DAY_MS = 86_400_000;

function orderUrgencyScore(order: RoutingOrder, now: Date, weights: PlanningWeights): number {
  const priority = (3 - PRIORITY_RANK[order.priority]) / 3;
  const customer =
    order.customerPriority != null ? (3 - PRIORITY_RANK[order.customerPriority]) / 3 : priority;
  const daysUntilDue = (order.dueDate.getTime() - now.getTime()) / DAY_MS;
  const due = 1 / (1 + Math.max(0, daysUntilDue));
  let score =
    weights.priorityWeight * priority +
    weights.dueDateWeight * due +
    weights.customerPriorityWeight * customer;
  if (order.earliestStartAt && order.earliestStartAt.getTime() > now.getTime()) {
    const daysUntilEligible = (order.earliestStartAt.getTime() - now.getTime()) / DAY_MS;
    score += weights.eligibilityWeight * (1 / (1 + daysUntilEligible));
  }
  return score;
}

function compareOrders(a: RoutingOrder, b: RoutingOrder, weights?: PlanningWeights, now?: Date): number {
  if (a.fastTrack && !b.fastTrack) return -1;
  if (b.fastTrack && !a.fastTrack) return 1;
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
    (segregationTransitionRequiresClean(fromFamily, toFamily)
      ? {
          id: syntheticSegregationRuleId(fromFamily!, toFamily!),
          workstationId: null,
          fromFamily: fromFamily!,
          toFamily: toFamily!,
          durationMinutes: DEFAULT_SEGREGATION_CLEAN_MINUTES,
        }
      : null)
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
      batchesSinceClean: 0,
    });
  }

  const operationMeta = new Map<string, { maxHoldHours: number | null }>();
  for (const order of input.orders) {
    for (const operation of order.operations) {
      operationMeta.set(operation.id, { maxHoldHours: operation.maxHoldHours ?? null });
    }
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
            state.batchesSinceClean += 1;
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

        if (operation.isQcHold) {
          const qcStart = predecessorReady;
          const qcEnd = new Date(qcStart.getTime() + Math.max(0, operation.durationMinutes) * 60_000);
          const qcScheduled: ScheduledOperation = {
            ...operation,
            workstationId: null,
            plannedStart: qcStart,
            plannedEnd: qcEnd,
            changeoverMinutes: 0,
            appliedChangeoverRuleId: null,
          };
          result.push(qcScheduled);
          resultById.set(qcScheduled.id, qcScheduled);
          continue;
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
            let changeoverMinutes = rule?.durationMinutes ?? 0;
            const sameFamily =
              state.lastFamily != null &&
              operation.changeoverFamily != null &&
              state.lastFamily === operation.changeoverFamily;
            if (
              sameFamily &&
              workstation.maxCampaignBatches != null &&
              workstation.maxCampaignBatches > 0 &&
              state.batchesSinceClean >= workstation.maxCampaignBatches
            ) {
              changeoverMinutes += DEFAULT_CAMPAIGN_MAJOR_CLEAN_MINUTES;
            }
            const runMinutes = Math.ceil(
              Math.max(0, operation.durationMinutes) * (100 / Math.max(1, resource.efficiencyPercent))
            );
            const start = alignToCalendar(later(state.availableAt, predecessorReady), calendar);
            let gmpCleanMinutes = 0;
            if (workstation.gmp) {
              if (!canScheduleOnWorkstation(workstation.gmp, start)) {
                return null;
              }
              gmpCleanMinutes = gmpCleanMinutesBeforeJob(workstation.gmp, start);
              if (!Number.isFinite(gmpCleanMinutes)) return null;
            }
            const totalMinutes =
              operation.setupMinutes +
              gmpCleanMinutes +
              changeoverMinutes +
              runMinutes +
              operation.teardownMinutes;
            const end = addWorkingMinutesOnCalendar(start, totalMinutes, calendar);
            return { resource, start, end, rule, changeoverMinutes: changeoverMinutes + gmpCleanMinutes };
          })
          .filter((row): row is NonNullable<typeof row> => row != null)
          .sort((a, b) => {
            const weights = input.weights;
            if (!weights) {
              return (
                a.end.getTime() - b.end.getTime() ||
                Number(b.resource.preferred) - Number(a.resource.preferred) ||
                a.resource.workstationId.localeCompare(b.resource.workstationId)
              );
            }
            const score = (candidate: typeof a) => {
              const rolePenalty =
                candidate.resource.resourceRole === "SUBCONTRACT"
                  ? 4 * 60 * 60_000
                  : candidate.resource.resourceRole === "ALTERNATE"
                    ? 30 * 60_000
                    : 0;
              return (
              candidate.end.getTime() +
              rolePenalty +
              weights.changeoverWeight * candidate.changeoverMinutes * 60_000 -
              weights.utilizationWeight * (candidate.resource.preferred ? 1 : 0) * 300_000 -
              weights.utilizationWeight * candidate.resource.efficiencyPercent * 1_000
              );
            };
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
        const wsState = resourceState.get(selected.resource.workstationId)!;
        const continuingCampaign =
          wsState.lastFamily != null &&
          operation.changeoverFamily != null &&
          wsState.lastFamily === operation.changeoverFamily;
        resourceState.set(selected.resource.workstationId, {
          availableAt: selected.end,
          lastFamily: operation.changeoverFamily,
          batchesSinceClean: continuingCampaign ? wsState.batchesSinceClean + 1 : 1,
        });
      }
    }
  }

  const withHold = appendMaxHoldIssues({
    orders: input.orders,
    dependencies: input.dependencies,
    operations: result,
    operationMeta,
    issues,
  });

  const feasibilityIssues = appendDueDateFeasibilityIssues({
    orders: input.orders,
    operations: result,
    issues: withHold,
  });

  return { operations: result, issues: feasibilityIssues };
}
