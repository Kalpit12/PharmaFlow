import type { AutopilotMode, Prisma } from "@prisma/client";

import { buildWorkCalendar, type WorkCalendar } from "@/lib/operations/calendar";
import { buildOrderMaterialConstraints } from "@/lib/operations/material-constraints";
import {
  buildProposedOrderChanges,
  rollupOrderFromOperations,
  summarizeProposal,
  type ProposalSummary,
} from "@/lib/operations/proposal";
import {
  bulldozePastOperations,
  filterOrdersUnscheduledOnly,
  lockOperationsOutsideWorkstationScope,
} from "@/lib/operations/planner-engine-actions";
import { planningWeightsFromPolicy } from "@/lib/operations/planner-policy-weights";
import {
  buildOperationSchedule,
  isOperationFrozen,
  type PlanningWeights,
  type RoutableOperation,
  type RoutingOrder,
} from "@/lib/operations/routing";
import { buildOptimizedOperationSchedule } from "@/lib/operations/schedule-optimizer";
import { syncAllActiveConnectors } from "@/lib/server/integrations/connector-service";
import { requirePermission } from "@/lib/auth/authorization";
import { writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import {
  findAcceptedPlanByIdempotencyKey,
  writePlanningEvent,
} from "@/lib/server/planning-events";

export type PlanningPolicyView = {
  priorityWeight: number;
  dueDateWeight: number;
  changeoverWeight: number;
  utilizationWeight: number;
  leadTimeWeight: number;
  onTimeCountWeight: number;
  customerPriorityWeight: number;
  similarJobsWeight: number;
  eligibilityWeight: number;
  considerMaterials: boolean;
  considerEligibility: boolean;
  freezeMinutes: number;
  freezeUntil: string;
  autopilotMode: AutopilotMode;
  useGlobalOptimizer: boolean;
};

export type ProposeScheduleOptions = {
  kind: "ALL" | "UNSCHEDULED_ONLY" | "WORKSTATION";
  workstationId?: string;
  bulldoze?: boolean;
  planLabel?: string;
};

export type ScheduleProposalView = {
  id: string;
  version: number;
  status: string;
  source: string;
  name: string;
  movedOrders: number;
  lockedOrders: number;
  blockedOrders: number;
  lateOrders: number;
  totalChangeoverMinutes: number;
  summary: string;
  freezeUntil: string | null;
  orders: Array<{
    orderNumber: string;
    previousStart: string | null;
    proposedStart: string | null;
    previousEnd: string | null;
    proposedEnd: string | null;
    changeMinutes: number;
    materialState: string;
    isLocked: boolean;
  }>;
};

export type DeliverySimulation = {
  productName: string;
  sku: string;
  quantity: number;
  feasibleEnd: string | null;
  atRisk: boolean;
  blocked: boolean;
  late: boolean;
  operations: Array<{
    code: string;
    name: string;
    workstationId: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    changeoverMinutes: number;
  }>;
  issues: string[];
};

type DbClient = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

const MUTABLE_ORDER_STATUSES = ["UNSCHEDULED", "SCHEDULED", "AT_RISK"] as const;

type WorkstationRowForSchedule = {
  id: string;
  code: string;
  capacityHoursPerDay: number;
  qualificationStatus: "QUALIFIED" | "DUE" | "EXPIRED";
  calibrationDueDate: Date | null;
  cleanStatus: "CLEAN" | "DIRTY";
  cleanHoldExpiresAt: Date | null;
};

function mapWorkstationsForScheduler(
  workstationRows: WorkstationRowForSchedule[],
  calendars: Map<string, WorkCalendar>,
  changeoverRows: Array<{ workstationId: string | null; maxCampaignBatches: number | null }>
) {
  const campaignByWorkstation = new Map<string, number>();
  let tenantCampaign: number | null = null;
  for (const rule of changeoverRows) {
    if (rule.maxCampaignBatches == null) continue;
    if (rule.workstationId) {
      const prev = campaignByWorkstation.get(rule.workstationId);
      if (prev == null || rule.maxCampaignBatches < prev) {
        campaignByWorkstation.set(rule.workstationId, rule.maxCampaignBatches);
      }
    } else if (tenantCampaign == null || rule.maxCampaignBatches < tenantCampaign) {
      tenantCampaign = rule.maxCampaignBatches;
    }
  }
  return workstationRows.map((row) => ({
    id: row.id,
    code: row.code,
    capacityHoursPerDay: row.capacityHoursPerDay,
    calendar: calendars.get(row.id),
    maxCampaignBatches: campaignByWorkstation.get(row.id) ?? tenantCampaign,
    gmp: {
      qualificationStatus: row.qualificationStatus,
      calibrationDueDate: row.calibrationDueDate,
      cleanStatus: row.cleanStatus,
      cleanHoldExpiresAt: row.cleanHoldExpiresAt,
    },
  }));
}

function buildOrderOperationDependencies(
  order: {
    operations: Array<{
      id: string;
      routingOperationId: string | null;
      routingOperation?: { runMinutesPerBatch: number; minCompletionPercent: number } | null;
    }>;
  },
  dependencyRows: Array<{ fromOperationId: string; toOperationId: string; minimumLagMinutes: number }>
) {
  const byRouting = new Map(
    order.operations
      .filter((operation) => operation.routingOperationId)
      .map((operation) => [operation.routingOperationId!, operation])
  );
  return dependencyRows.flatMap((dependency) => {
    const fromProd = byRouting.get(dependency.fromOperationId);
    const toProd = byRouting.get(dependency.toOperationId);
    if (!fromProd || !toProd) return [];
    const fromRouting = fromProd.routingOperation;
    const completionLag = fromRouting
      ? Math.ceil((fromRouting.runMinutesPerBatch * fromRouting.minCompletionPercent) / 100)
      : 0;
    return [
      {
        fromOperationId: fromProd.id,
        toOperationId: toProd.id,
        minimumLagMinutes: dependency.minimumLagMinutes + completionLag,
      },
    ];
  });
}

function freezeUntilFromPolicy(freezeMinutes: number, now = new Date()): Date {
  return new Date(now.getTime() + Math.max(0, freezeMinutes) * 60_000);
}

function toPolicyView(policy: {
  priorityWeight: number;
  dueDateWeight: number;
  changeoverWeight: number;
  utilizationWeight: number;
  leadTimeWeight: number;
  onTimeCountWeight: number;
  customerPriorityWeight: number;
  similarJobsWeight: number;
  eligibilityWeight: number;
  considerMaterials: boolean;
  considerEligibility: boolean;
  freezeMinutes: number;
  autopilotMode: AutopilotMode;
  useGlobalOptimizer: boolean;
}): PlanningPolicyView {
  return {
    priorityWeight: policy.priorityWeight,
    dueDateWeight: policy.dueDateWeight,
    changeoverWeight: policy.changeoverWeight,
    utilizationWeight: policy.utilizationWeight,
    leadTimeWeight: policy.leadTimeWeight,
    onTimeCountWeight: policy.onTimeCountWeight,
    customerPriorityWeight: policy.customerPriorityWeight,
    similarJobsWeight: policy.similarJobsWeight,
    eligibilityWeight: policy.eligibilityWeight,
    considerMaterials: policy.considerMaterials,
    considerEligibility: policy.considerEligibility,
    freezeMinutes: policy.freezeMinutes,
    freezeUntil: freezeUntilFromPolicy(policy.freezeMinutes).toISOString(),
    autopilotMode: policy.autopilotMode,
    useGlobalOptimizer: policy.useGlobalOptimizer,
  };
}

function policyToWeights(policy: PlanningPolicyView): PlanningWeights {
  return planningWeightsFromPolicy(policy);
}

export type PlannerEngineSnapshot = {
  policy: PlanningPolicyView;
  proposal: ScheduleProposalView | null;
};

export async function getPlannerEngineSnapshot(ctx: TenantContext): Promise<PlannerEngineSnapshot> {
  requirePermission(ctx, "production.read");
  const [policy, proposal] = await Promise.all([getOrCreatePlanningPolicy(ctx), getActiveProposal(ctx)]);
  return { policy, proposal };
}

export async function getOrCreatePlanningPolicy(ctx: TenantContext): Promise<PlanningPolicyView> {
  const prisma = getPrisma();
  const existing = await prisma.planningPolicy.findUnique({ where: { tenantId: ctx.tenantId } });
  if (existing) return toPolicyView(existing);
  const created = await prisma.planningPolicy.create({
    data: { tenantId: ctx.tenantId },
  });
  return toPolicyView(created);
}

export async function updatePlanningPolicy(
  ctx: TenantContext,
  input: Partial<Omit<PlanningPolicyView, "freezeUntil">>
): Promise<PlanningPolicyView> {
  requirePermission(ctx, "production.global_rules");
  const current = await getOrCreatePlanningPolicy(ctx);
  const prisma = getPrisma();
  const updated = await prisma.planningPolicy.upsert({
    where: { tenantId: ctx.tenantId },
    create: { tenantId: ctx.tenantId },
    update: {
      priorityWeight: input.priorityWeight ?? current.priorityWeight,
      dueDateWeight: input.dueDateWeight ?? current.dueDateWeight,
      changeoverWeight: input.changeoverWeight ?? current.changeoverWeight,
      utilizationWeight: input.utilizationWeight ?? current.utilizationWeight,
      leadTimeWeight: input.leadTimeWeight ?? current.leadTimeWeight,
      onTimeCountWeight: input.onTimeCountWeight ?? current.onTimeCountWeight,
      customerPriorityWeight: input.customerPriorityWeight ?? current.customerPriorityWeight,
      similarJobsWeight: input.similarJobsWeight ?? current.similarJobsWeight,
      eligibilityWeight: input.eligibilityWeight ?? current.eligibilityWeight,
      considerMaterials: input.considerMaterials ?? current.considerMaterials,
      considerEligibility: input.considerEligibility ?? current.considerEligibility,
      freezeMinutes: input.freezeMinutes ?? current.freezeMinutes,
      autopilotMode: input.autopilotMode ?? current.autopilotMode,
      useGlobalOptimizer: input.useGlobalOptimizer ?? current.useGlobalOptimizer,
    },
  });
  await writeAuditLog(ctx, {
    action: "PLANNING_POLICY_UPDATED",
    entityType: "PLANNING_POLICY",
    entityId: updated.id,
    newValue: `FREEZE: ${updated.freezeMinutes}m; AUTOPILOT: ${updated.autopilotMode}`,
  });
  return toPolicyView(updated);
}

export async function loadWorkstationCalendars(
  tenantId: string,
  workstations: Array<{ id: string; code: string; capacityHoursPerDay: number }>
): Promise<Map<string, WorkCalendar>> {
  const prisma = getPrisma();
  const ids = workstations.map((row) => row.id);
  const [shifts, exceptions] = await Promise.all([
    prisma.workstationShift.findMany({ where: { tenantId, workstationId: { in: ids } } }),
    prisma.workstationCalendarException.findMany({ where: { tenantId, workstationId: { in: ids } } }),
  ]);
  const result = new Map<string, WorkCalendar>();
  for (const workstation of workstations) {
    result.set(
      workstation.id,
      buildWorkCalendar({
        capacityHoursPerDay: workstation.capacityHoursPerDay,
        shifts: shifts
          .filter((shift) => shift.workstationId === workstation.id)
          .map((shift) => ({
            weekday: shift.weekday,
            startMinute: shift.startMinute,
            endMinute: shift.endMinute,
          })),
        exceptions: exceptions
          .filter((row) => row.workstationId === workstation.id)
          .map((row) => ({
            date: row.date.toISOString().slice(0, 10),
            reason: row.reason,
            closed: row.closed,
            startMinute: row.startMinute,
            endMinute: row.endMinute,
          })),
      })
    );
  }
  return result;
}

export async function instantiateOperationsForOrder(
  tx: DbClient,
  tenantId: string,
  order: {
    id: string;
    productId: string;
    workstationId: string | null;
    durationMinutes: number;
    status: string;
    isLocked: boolean;
  }
): Promise<number> {
  const existing = await tx.productionOperation.count({ where: { productionOrderId: order.id } });
  if (existing > 0) return existing;
  const routing = await tx.productRouting.findFirst({
    where: { tenantId, productId: order.productId, active: true },
    include: { operations: { include: { resources: true }, orderBy: { sequence: "asc" } } },
    orderBy: { version: "desc" },
  });
  const operations = routing?.operations ?? [];
  if (operations.length === 0) return 0;
  const totalWeight = operations.reduce((sum, operation) => sum + operation.runMinutesPerBatch, 0) || 1;
  await tx.productionOperation.createMany({
    data: operations.map((operation) => {
      const qualified = operation.resources.find((resource) => resource.workstationId === order.workstationId);
      const selected =
        qualified ?? operation.resources.find((resource) => resource.preferred) ?? operation.resources[0];
      return {
        tenantId,
        productionOrderId: order.id,
        routingOperationId: operation.id,
        operationCode: operation.code,
        operationName: operation.name,
        sequence: operation.sequence,
        workstationId: selected?.workstationId ?? null,
        durationMinutes: Math.max(
          30,
          Math.round(order.durationMinutes * (operation.runMinutesPerBatch / totalWeight))
        ),
        setupMinutes: operation.setupMinutes,
        teardownMinutes: operation.teardownMinutes,
        changeoverFamily: operation.changeoverFamily,
        status:
          order.status === "COMPLETED"
            ? "COMPLETED"
            : order.status === "IN_PROGRESS" && operation.sequence === operations[0].sequence
              ? "IN_PROGRESS"
              : "UNSCHEDULED",
        isLocked: order.isLocked,
      };
    }),
    skipDuplicates: true,
  });
  return operations.length;
}

function operationIsCommitted(
  operation: { isLocked: boolean; status: string; plannedStart: Date | null },
  orderLocked: boolean,
  freezeUntil: Date
): boolean {
  if (orderLocked || operation.isLocked) return true;
  if (operation.status === "IN_PROGRESS" || operation.status === "COMPLETED" || operation.status === "PAUSED") {
    return true;
  }
  return isOperationFrozen(operation, freezeUntil);
}

async function mapProposal(planId: string, tenantId: string): Promise<ScheduleProposalView | null> {
  const prisma = getPrisma();
  const plan = await prisma.schedulePlan.findFirst({
    where: { id: planId, tenantId },
    include: {
      orders: { include: { productionOrder: { select: { orderNumber: true } } } },
    },
  });
  if (!plan) return null;
  const summary = (plan.summary ?? {}) as Partial<ProposalSummary> & { text?: string };
  return {
    id: plan.id,
    version: plan.version,
    status: plan.status,
    source: plan.source,
    name: plan.name,
    movedOrders: summary.movedOrders ?? 0,
    lockedOrders: summary.lockedOrders ?? 0,
    blockedOrders: summary.blockedOrders ?? 0,
    lateOrders: summary.lateOrders ?? 0,
    totalChangeoverMinutes: summary.totalChangeoverMinutes ?? 0,
    summary: summary.text ?? plan.name,
    freezeUntil: summary.freezeUntil ?? null,
    orders: plan.orders.map((row) => ({
      orderNumber: row.productionOrder.orderNumber,
      previousStart: row.previousStart?.toISOString() ?? null,
      proposedStart: row.proposedStart?.toISOString() ?? null,
      previousEnd: row.previousEnd?.toISOString() ?? null,
      proposedEnd: row.proposedEnd?.toISOString() ?? null,
      changeMinutes: row.changeMinutes,
      materialState: row.materialState,
      isLocked: row.isLocked,
    })),
  };
}

export async function getActiveProposal(ctx: TenantContext): Promise<ScheduleProposalView | null> {
  const prisma = getPrisma();
  const plan = await prisma.schedulePlan.findFirst({
    where: { tenantId: ctx.tenantId, status: { in: ["DRAFT", "PROPOSED"] } },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (!plan) return null;
  return mapProposal(plan.id, ctx.tenantId);
}

export async function proposeSchedule(
  ctx: TenantContext,
  windowStartIso?: string,
  options: ProposeScheduleOptions = { kind: "ALL" }
): Promise<ScheduleProposalView> {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const policy = await getOrCreatePlanningPolicy(ctx);
  const windowStart = windowStartIso ? new Date(windowStartIso) : new Date();
  if (Number.isNaN(windowStart.getTime())) throw new ServerError("Window start is not a valid date.", "INTERNAL");
  if (options.kind === "WORKSTATION" && !options.workstationId) {
    throw new ServerError("workstationId is required for workstation reschedule.", "INTERNAL");
  }
  const freezeUntil = freezeUntilFromPolicy(policy.freezeMinutes, windowStart);
  const weights = policyToWeights(policy);

  const [workstationRows, orderRows, dependencyRows, changeoverRows] = await Promise.all([
    prisma.workstation.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { code: "asc" } }),
    prisma.productionOrder.findMany({
      where: { tenantId: ctx.tenantId, status: { not: "COMPLETED" } },
      include: {
        customer: { select: { defaultPriority: true } },
        operations: {
          include: { routingOperation: { include: { resources: true } } },
          orderBy: { sequence: "asc" },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.routingDependency.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.changeoverRule.findMany({ where: { tenantId: ctx.tenantId } }),
  ]);

  for (const order of orderRows) {
    if (order.operations.length === 0) {
      await instantiateOperationsForOrder(prisma, ctx.tenantId, order);
    }
  }
  const refreshedOrders = await prisma.productionOrder.findMany({
    where: { tenantId: ctx.tenantId, status: { not: "COMPLETED" } },
    include: {
      customer: { select: { defaultPriority: true } },
      operations: {
        include: { routingOperation: { include: { resources: true } } },
        orderBy: { sequence: "asc" },
      },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  const calendars = await loadWorkstationCalendars(ctx.tenantId, workstationRows);
  const materials = await getMaterialsSnapshot(ctx, resolveMaterialsFilters({})).catch(() => null);
  const materialConstraints = buildOrderMaterialConstraints(
    materials?.materials ?? [],
    refreshedOrders.map((order) => order.id),
    materials?.generatedAt ? new Date(materials.generatedAt) : windowStart
  );

  const isStarted = (operationId: string) => {
    for (const order of refreshedOrders) {
      const op = order.operations.find((row) => row.id === operationId);
      if (!op) continue;
      return op.status === "IN_PROGRESS" || op.status === "COMPLETED" || op.status === "PAUSED";
    }
    return false;
  };

  let routingOrders: RoutingOrder[] = refreshedOrders
    .filter((order) => order.operations.length > 0)
    .map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      priority: order.priority,
      customerPriority: order.customer?.defaultPriority ?? null,
      dueDate: order.dueDate,
      createdAt: order.createdAt,
      earliestStartAt: policy.considerEligibility ? order.earliestStartAt : null,
      fastTrack: order.fastTrack,
      materialReadyAt: policy.considerMaterials ? materialConstraints.get(order.id)?.readyAt ?? null : null,
      materialBlocked: policy.considerMaterials ? materialConstraints.get(order.id)?.state === "BLOCKED" : false,
      operations: order.operations.map((operation) => {
        const committed = operationIsCommitted(operation, order.isLocked, freezeUntil);
        return {
          id: operation.id,
          orderId: order.id,
          orderNumber: order.orderNumber,
          sequence: operation.sequence,
          durationMinutes: operation.durationMinutes,
          setupMinutes: operation.setupMinutes,
          teardownMinutes: operation.teardownMinutes,
          changeoverFamily: operation.changeoverFamily,
          resources:
            operation.routingOperation?.resources.map((resource) => ({
              workstationId: resource.workstationId,
              efficiencyPercent: resource.efficiencyPercent,
              preferred: resource.preferred,
              resourceRole: resource.resourceRole,
            })) ??
            (operation.workstationId
              ? [{ workstationId: operation.workstationId, efficiencyPercent: 100, preferred: true }]
              : []),
          locked: committed,
          workstationId: operation.workstationId,
          plannedStart: operation.plannedStart,
          plannedEnd: operation.plannedEnd,
          isQcHold: operation.routingOperation?.isQcHold ?? false,
          maxHoldHours: operation.routingOperation?.maxHoldHours ?? null,
        } satisfies RoutableOperation;
      }),
    }));

  if (options.bulldoze) {
    routingOrders = routingOrders.map((order) => ({
      ...order,
      operations: bulldozePastOperations(order.operations, windowStart, isStarted),
    }));
  }

  if (options.kind === "WORKSTATION" && options.workstationId) {
    routingOrders = routingOrders.map((order) => ({
      ...order,
      operations: lockOperationsOutsideWorkstationScope(
        order.operations,
        options.workstationId!,
        freezeUntil,
        (op) => op.locked
      ),
    }));
  }

  if (options.kind === "UNSCHEDULED_ONLY") {
    routingOrders = filterOrdersUnscheduledOnly(routingOrders);
  }

  const dependencies = refreshedOrders.flatMap((order) =>
    buildOrderOperationDependencies(order, dependencyRows)
  );

  const scheduleInput = {
    orders: routingOrders,
    dependencies,
    workstations: mapWorkstationsForScheduler(workstationRows, calendars, changeoverRows),
    changeovers: changeoverRows,
    windowStart,
    freezeUntil,
    weights,
  };
  const policyRow = await prisma.planningPolicy.findUnique({ where: { tenantId: ctx.tenantId } });
  const scheduled =
    policyRow?.useGlobalOptimizer !== false
      ? buildOptimizedOperationSchedule(scheduleInput)
      : buildOperationSchedule(scheduleInput);

  const changes = buildProposedOrderChanges({
    orders: refreshedOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      dueDate: order.dueDate,
      previousStart: order.plannedStart,
      previousEnd: order.plannedEnd,
      previousWorkstationId: order.workstationId,
      materialState: materialConstraints.get(order.id)?.state ?? "UNKNOWN",
      isLocked: order.isLocked,
    })),
    operations: scheduled.operations,
    freezeUntil,
  });
  const summary = summarizeProposal({ orders: changes, operations: scheduled.operations, freezeUntil });
  const source = policy.autopilotMode === "OFF" ? "AUTO_SCHEDULE" : "AUTOPILOT";
  const created = await prisma.$transaction(async (tx) => {
    await tx.schedulePlan.updateMany({
      where: { tenantId: ctx.tenantId, status: { in: ["DRAFT", "PROPOSED"] } },
      data: { status: "SUPERSEDED" },
    });
    const latest = await tx.schedulePlan.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    return tx.schedulePlan.create({
      data: {
        tenantId: ctx.tenantId,
        version,
        name: options.planLabel ?? `Reschedule all v${version}`,
        status: "PROPOSED",
        source,
        windowStart,
        windowEnd: new Date(windowStart.getTime() + 28 * 24 * 60 * 60 * 1000),
        priorityWeight: policy.priorityWeight,
        dueDateWeight: policy.dueDateWeight,
        changeoverWeight: policy.changeoverWeight,
        utilizationWeight: policy.utilizationWeight,
        summary: summary as unknown as Prisma.InputJsonValue,
        orders: {
          create: changes.map((row) => ({
            tenantId: ctx.tenantId,
            productionOrderId: row.productionOrderId,
            proposedWorkstationId: row.proposedWorkstationId,
            proposedStart: row.proposedStart,
            proposedEnd: row.proposedEnd,
            previousStart: row.previousStart,
            previousEnd: row.previousEnd,
            materialState: row.materialState,
            isLocked: row.isLocked,
            changeMinutes: row.changeMinutes,
            deliveryDeltaMinutes: row.deliveryDeltaMinutes,
          })),
        },
        operations: {
          create: scheduled.operations.map((operation) => ({
            tenantId: ctx.tenantId,
            productionOperationId: operation.id,
            workstationId: operation.workstationId,
            proposedStart: operation.plannedStart,
            proposedEnd: operation.plannedEnd,
            changeoverMinutes: operation.changeoverMinutes,
            appliedChangeoverRuleId: operation.appliedChangeoverRuleId,
            isLocked: operation.locked,
          })),
        },
      },
      select: { id: true },
    });
  }, { maxWait: 20_000, timeout: 120_000 });

  await writeAuditLog(ctx, {
    action: "SCHEDULE_PLAN_PROPOSED",
    entityType: "SCHEDULE_PLAN",
    entityId: created.id,
    newValue: summary.text,
  });
  await writePlanningEvent(ctx, {
    eventType: "PROPOSED",
    schedulePlanId: created.id,
    summary: summary.text,
  });

  if (policy.autopilotMode === "AUTO_ACCEPT_UNLOCKED") {
    const accepted = await acceptSchedulePlan(ctx, created.id);
    await writePlanningEvent(ctx, {
      eventType: "AUTO_ACCEPTED",
      schedulePlanId: created.id,
      summary: `Autopilot accepted plan v${accepted.version}.`,
    });
    return accepted;
  }

  const view = await mapProposal(created.id, ctx.tenantId);
  if (!view) throw new ServerError("Proposed plan could not be loaded.", "INTERNAL");
  return view;
}

export async function proposeRescheduleAll(ctx: TenantContext, windowStartIso?: string): Promise<ScheduleProposalView> {
  return proposeSchedule(ctx, windowStartIso, { kind: "ALL" });
}

export async function proposeRescheduleUnscheduled(ctx: TenantContext, windowStartIso?: string) {
  return proposeSchedule(ctx, windowStartIso, { kind: "UNSCHEDULED_ONLY", planLabel: "Schedule unscheduled" });
}

export async function proposeRescheduleWorkstation(ctx: TenantContext, workstationId: string, windowStartIso?: string) {
  const prisma = getPrisma();
  const ws = await prisma.workstation.findFirst({ where: { id: workstationId, tenantId: ctx.tenantId } });
  if (!ws) throw new ServerError("Workstation not found.", "NOT_FOUND");
  return proposeSchedule(ctx, windowStartIso, {
    kind: "WORKSTATION",
    workstationId,
    planLabel: `Reschedule ${ws.code}`,
  });
}

export async function proposeWithBulldozer(ctx: TenantContext, windowStartIso?: string) {
  return proposeSchedule(ctx, windowStartIso, { kind: "ALL", bulldoze: true, planLabel: "Bulldozer replan" });
}

export async function setOrderFastTrackAndPropose(ctx: TenantContext, orderId: string, windowStartIso?: string) {
  const prisma = getPrisma();
  const order = await prisma.productionOrder.findFirst({ where: { id: orderId, tenantId: ctx.tenantId } });
  if (!order) throw new ServerError("Production order not found.", "NOT_FOUND");
  await prisma.productionOrder.updateMany({ where: { tenantId: ctx.tenantId, fastTrack: true }, data: { fastTrack: false } });
  await prisma.productionOrder.update({ where: { id: order.id }, data: { fastTrack: true } });
  await writeAuditLog(ctx, {
    action: "PRODUCTION_ORDER_FAST_TRACK",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    newValue: order.orderNumber,
  });
  return proposeSchedule(ctx, windowStartIso, { kind: "ALL", planLabel: `Fast track ${order.orderNumber}` });
}

export async function unscheduleProductionOrder(ctx: TenantContext, orderId: string) {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const order = await prisma.productionOrder.findFirst({
    where: { id: orderId, tenantId: ctx.tenantId },
    include: { operations: true },
  });
  if (!order) throw new ServerError("Production order not found.", "NOT_FOUND");
  if (order.isLocked) throw new ServerError("Locked orders cannot be unscheduled.", "FORBIDDEN");
  await prisma.$transaction(async (tx) => {
    for (const operation of order.operations) {
      if (operation.status === "IN_PROGRESS" || operation.status === "COMPLETED") continue;
      await tx.productionOperation.update({
        where: { id: operation.id },
        data: { plannedStart: null, plannedEnd: null, workstationId: null, status: "UNSCHEDULED" },
      });
    }
    await tx.productionOrder.update({
      where: { id: order.id },
      data: { plannedStart: null, plannedEnd: null, workstationId: null, status: "UNSCHEDULED", fastTrack: false },
    });
  });
  await writeAuditLog(ctx, {
    action: "PRODUCTION_ORDER_UNSCHEDULED",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    newValue: order.orderNumber,
  });
  return { ok: true, orderNumber: order.orderNumber };
}

export async function unscheduleAllOpenOrders(ctx: TenantContext) {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const orders = await prisma.productionOrder.findMany({
    where: { tenantId: ctx.tenantId, status: { not: "COMPLETED" }, isLocked: false },
    include: { operations: true },
  });
  let count = 0;
  await prisma.$transaction(async (tx) => {
    for (const order of orders) {
      let touched = false;
      for (const operation of order.operations) {
        if (operation.status === "IN_PROGRESS" || operation.status === "COMPLETED") continue;
        if (!operation.plannedStart && !operation.plannedEnd) continue;
        await tx.productionOperation.update({
          where: { id: operation.id },
          data: { plannedStart: null, plannedEnd: null, workstationId: null, status: "UNSCHEDULED" },
        });
        touched = true;
      }
      if (touched || order.plannedStart) {
        await tx.productionOrder.update({
          where: { id: order.id },
          data: { plannedStart: null, plannedEnd: null, workstationId: null, status: "UNSCHEDULED", fastTrack: false },
        });
        count += 1;
      }
    }
  });
  await writeAuditLog(ctx, {
    action: "PRODUCTION_ORDERS_UNSCHEDULED_ALL",
    entityType: "PRODUCTION_ORDER",
    newValue: `${count} orders`,
  });
  return { ok: true, count };
}

export async function acceptSchedulePlan(
  ctx: TenantContext,
  planId: string,
  options?: { idempotencyKey?: string }
): Promise<ScheduleProposalView> {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const plan = await prisma.schedulePlan.findFirst({
    where: { id: planId, tenantId: ctx.tenantId },
    include: { orders: true, operations: true },
  });
  if (!plan) throw new ServerError("Schedule plan not found.", "NOT_FOUND");
  if (plan.status === "ACCEPTED") {
    const view = await mapProposal(plan.id, ctx.tenantId);
    if (!view) throw new ServerError("Accepted plan could not be loaded.", "INTERNAL");
    return view;
  }
  const priorAccept = await findAcceptedPlanByIdempotencyKey(ctx, planId, options?.idempotencyKey);
  if (priorAccept) {
    const view = await mapProposal(priorAccept, ctx.tenantId);
    if (view) return view;
  }
  if (plan.status !== "PROPOSED" && plan.status !== "DRAFT") {
    throw new ServerError("Only a proposed plan can be accepted.", "FORBIDDEN");
  }

  const orderRows = await prisma.productionOrder.findMany({
    where: { id: { in: plan.orders.map((row) => row.productionOrderId) } },
    select: { id: true, status: true, dueDate: true, isLocked: true },
  });
  const statusById = new Map(orderRows.map((row) => [row.id, row.status]));
  const dueById = new Map(orderRows.map((row) => [row.id, row.dueDate]));
  const orderLockedById = new Map(orderRows.map((row) => [row.id, row.isLocked]));

  await prisma.$transaction(
    async (tx) => {
    for (const operation of plan.operations) {
      const nextStatus = operation.proposedStart && operation.proposedEnd ? "SCHEDULED" : "UNSCHEDULED";
      await tx.productionOperation.update({
        where: { id: operation.productionOperationId },
        data: {
          workstationId: operation.workstationId,
          plannedStart: operation.proposedStart,
          plannedEnd: operation.proposedEnd,
          status: nextStatus,
        },
      });
    }
    for (const order of plan.orders) {
      if (orderLockedById.get(order.productionOrderId)) continue;
      const currentStatus = statusById.get(order.productionOrderId);
      if (!currentStatus || !MUTABLE_ORDER_STATUSES.includes(currentStatus as (typeof MUTABLE_ORDER_STATUSES)[number])) {
        continue;
      }
      const due = dueById.get(order.productionOrderId);
      const atRisk = Boolean(order.proposedEnd && due && order.proposedEnd.getTime() > due.getTime());
      const nextStatus = !order.proposedStart
        ? "UNSCHEDULED"
        : atRisk
          ? "AT_RISK"
          : "SCHEDULED";
      await tx.productionOrder.update({
        where: { id: order.productionOrderId },
        data: {
          workstationId: order.proposedWorkstationId,
          plannedStart: order.proposedStart,
          plannedEnd: order.proposedEnd,
          status: nextStatus,
        },
      });
    }
    await tx.schedulePlan.updateMany({
      where: { tenantId: ctx.tenantId, status: "ACCEPTED", id: { not: plan.id } },
      data: { status: "SUPERSEDED" },
    });
    await tx.schedulePlan.update({
      where: { id: plan.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedById: ctx.userId,
      },
    });
    },
    { maxWait: 20_000, timeout: 120_000 }
  );

  await writeAuditLog(ctx, {
    action: "SCHEDULE_PLAN_ACCEPTED",
    entityType: "SCHEDULE_PLAN",
    entityId: plan.id,
    newValue: `VERSION: ${plan.version}`,
  });
  const acceptKey = options?.idempotencyKey?.trim()
    ? `accept:${planId}:${options.idempotencyKey.trim()}`
    : undefined;
  await writePlanningEvent(ctx, {
    eventType: "ACCEPTED",
    schedulePlanId: plan.id,
    summary: `Accepted plan v${plan.version}.`,
    idempotencyKey: acceptKey,
  });

  const { emitPlannerWebhook } = await import("@/lib/server/planner-webhooks");
  await emitPlannerWebhook(ctx, "SCHEDULE_PLAN_ACCEPTED", {
    planId: plan.id,
    version: plan.version,
    orderCount: plan.orders.length,
  }).catch(() => undefined);

  const view = await mapProposal(plan.id, ctx.tenantId);
  if (!view) throw new ServerError("Accepted plan could not be loaded.", "INTERNAL");
  void syncAllActiveConnectors(ctx).catch(() => undefined);
  return view;
}

export async function proposeGanttOrderMove(
  ctx: TenantContext,
  input: { orderId: string; workstationId: string; proposedStart: string }
): Promise<ScheduleProposalView> {
  requirePermission(ctx, "production.schedule");
  const proposedStart = new Date(input.proposedStart);
  if (Number.isNaN(proposedStart.getTime())) {
    throw new ServerError("Proposed start is not a valid date.", "INTERNAL");
  }
  const prisma = getPrisma();
  const order = await prisma.productionOrder.findFirst({
    where: { id: input.orderId, tenantId: ctx.tenantId },
    include: {
      operations: { include: { routingOperation: { include: { resources: true } } }, orderBy: { sequence: "asc" } },
    },
  });
  if (!order) throw new ServerError("Production order not found.", "NOT_FOUND");
  if (order.isLocked) throw new ServerError("Locked orders cannot be moved from the Gantt.", "FORBIDDEN");

  const first = order.operations[0];
  if (!first) throw new ServerError("Order has no operations to move.", "INTERNAL");
  const qualified = first.routingOperation?.resources.some((resource) => resource.workstationId === input.workstationId);
  if (!qualified) throw new ServerError("Target workstation is not qualified for this order.", "FORBIDDEN");

  const shiftMs = proposedStart.getTime() - (first.plannedStart?.getTime() ?? proposedStart.getTime());
  await prisma.productionOperation.updateMany({
    where: { productionOrderId: order.id, tenantId: ctx.tenantId },
    data: { isLocked: false },
  });
  for (const operation of order.operations) {
    const nextStart = operation.plannedStart ? new Date(operation.plannedStart.getTime() + shiftMs) : proposedStart;
    const nextEnd = operation.plannedEnd
      ? new Date(operation.plannedEnd.getTime() + shiftMs)
      : new Date(nextStart.getTime() + operation.durationMinutes * 60_000);
    await prisma.productionOperation.update({
      where: { id: operation.id },
      data: {
        workstationId: operation.sequence === first.sequence ? input.workstationId : operation.workstationId,
        plannedStart: nextStart,
        plannedEnd: nextEnd,
        isLocked: true,
      },
    });
  }

  const shiftedOps = await prisma.productionOperation.findMany({
    where: { productionOrderId: order.id, tenantId: ctx.tenantId },
    orderBy: { sequence: "asc" },
  });
  const rolled = rollupOrderFromOperations(
    shiftedOps.map((operation) => ({
      id: operation.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      sequence: operation.sequence,
      durationMinutes: operation.durationMinutes,
      setupMinutes: operation.setupMinutes,
      teardownMinutes: operation.teardownMinutes,
      changeoverFamily: operation.changeoverFamily,
      resources: [],
      locked: true,
      workstationId: operation.workstationId,
      plannedStart: operation.plannedStart,
      plannedEnd: operation.plannedEnd,
      changeoverMinutes: 0,
      appliedChangeoverRuleId: null,
    }))
  );
  await prisma.productionOrder.update({
    where: { id: order.id },
    data: {
      workstationId: rolled.workstationId,
      plannedStart: rolled.plannedStart,
      plannedEnd: rolled.plannedEnd,
    },
  });

  return proposeRescheduleAll(ctx, proposedStart.toISOString());
}

export async function rejectSchedulePlan(ctx: TenantContext, planId: string): Promise<ScheduleProposalView> {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const plan = await prisma.schedulePlan.findFirst({ where: { id: planId, tenantId: ctx.tenantId } });
  if (!plan) throw new ServerError("Schedule plan not found.", "NOT_FOUND");
  if (plan.status !== "PROPOSED" && plan.status !== "DRAFT") {
    throw new ServerError("Only a proposed plan can be rejected.", "FORBIDDEN");
  }
  await prisma.schedulePlan.update({ where: { id: plan.id }, data: { status: "REJECTED" } });
  await writeAuditLog(ctx, {
    action: "SCHEDULE_PLAN_REJECTED",
    entityType: "SCHEDULE_PLAN",
    entityId: plan.id,
    newValue: `VERSION: ${plan.version}`,
  });
  await writePlanningEvent(ctx, {
    eventType: "REJECTED",
    schedulePlanId: plan.id,
    summary: `Rejected plan v${plan.version}.`,
  });
  const view = await mapProposal(plan.id, ctx.tenantId);
  if (!view) throw new ServerError("Rejected plan could not be loaded.", "INTERNAL");
  return view;
}

export async function simulateDeliveryDate(
  ctx: TenantContext,
  input: { productId: string; quantity: number; priority?: RoutingOrder["priority"]; dueDate: string }
): Promise<DeliverySimulation> {
  requirePermission(ctx, "production.read");
  const prisma = getPrisma();
  const product = await prisma.product.findFirst({
    where: { id: input.productId, tenantId: ctx.tenantId },
    select: { id: true, name: true, sku: true },
  });
  if (!product) throw new ServerError("Product not found.", "NOT_FOUND");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ServerError("Quantity must be a positive whole number.", "INTERNAL");
  }
  const dueDate = new Date(input.dueDate);
  if (Number.isNaN(dueDate.getTime())) throw new ServerError("Due date is not a valid date.", "INTERNAL");

  const policy = await getOrCreatePlanningPolicy(ctx);
  const windowStart = new Date();
  const freezeUntil = freezeUntilFromPolicy(policy.freezeMinutes, windowStart);
  const routing = await prisma.productRouting.findFirst({
    where: { tenantId: ctx.tenantId, productId: product.id, active: true },
    include: { operations: { include: { resources: true }, orderBy: { sequence: "asc" } } },
    orderBy: { version: "desc" },
  });
  if (!routing || routing.operations.length === 0) {
    return {
      productName: product.name,
      sku: product.sku,
      quantity: input.quantity,
      feasibleEnd: null,
      atRisk: false,
      blocked: true,
      late: false,
      operations: [],
      issues: ["No active routing exists for this product."],
    };
  }

  const [workstationRows, liveOrders, dependencyRows, changeoverRows] = await Promise.all([
    prisma.workstation.findMany({ where: { tenantId: ctx.tenantId, active: true } }),
    prisma.productionOrder.findMany({
      where: { tenantId: ctx.tenantId, status: { not: "COMPLETED" } },
      include: { operations: { include: { routingOperation: { include: { resources: true } } } } },
    }),
    prisma.routingDependency.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.changeoverRule.findMany({ where: { tenantId: ctx.tenantId } }),
  ]);
  const calendars = await loadWorkstationCalendars(ctx.tenantId, workstationRows);
  const totalWeight = routing.operations.reduce((sum, operation) => sum + operation.runMinutesPerBatch, 0) || 1;
  const durationMinutes = routing.operations.reduce((sum, operation) => sum + operation.runMinutesPerBatch, 0);
  const virtualId = "SIM-DELIVERY";
  const virtualOps: RoutableOperation[] = routing.operations.map((operation) => ({
    id: `sim-${operation.id}`,
    orderId: virtualId,
    orderNumber: virtualId,
    sequence: operation.sequence,
    durationMinutes: Math.max(30, Math.round(durationMinutes * (operation.runMinutesPerBatch / totalWeight))),
    setupMinutes: operation.setupMinutes,
    teardownMinutes: operation.teardownMinutes,
    changeoverFamily: operation.changeoverFamily,
    resources: operation.resources.map((resource) => ({
      workstationId: resource.workstationId,
      efficiencyPercent: resource.efficiencyPercent,
      preferred: resource.preferred,
      resourceRole: resource.resourceRole,
    })),
    locked: false,
    workstationId: null,
    plannedStart: null,
    plannedEnd: null,
    isQcHold: operation.isQcHold,
    maxHoldHours: operation.maxHoldHours,
  }));
  const occupancy: RoutingOrder[] = liveOrders
    .filter((order) => order.operations.length > 0)
    .map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      priority: order.priority,
      dueDate: order.dueDate,
      createdAt: order.createdAt,
      operations: order.operations.map((operation) => ({
        id: operation.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        sequence: operation.sequence,
        durationMinutes: operation.durationMinutes,
        setupMinutes: operation.setupMinutes,
        teardownMinutes: operation.teardownMinutes,
        changeoverFamily: operation.changeoverFamily,
        resources:
          operation.routingOperation?.resources.map((resource) => ({
            workstationId: resource.workstationId,
            efficiencyPercent: resource.efficiencyPercent,
            preferred: resource.preferred,
            resourceRole: resource.resourceRole,
          })) ?? [],
        locked: operationIsCommitted(operation, order.isLocked, freezeUntil),
        workstationId: operation.workstationId,
        plannedStart: operation.plannedStart,
        plannedEnd: operation.plannedEnd,
      })),
    }));

  const byRouting = new Map(routing.operations.map((operation) => [operation.id, `sim-${operation.id}`]));
  const routingById = new Map(routing.operations.map((operation) => [operation.id, operation]));
  const simDependencies = dependencyRows.flatMap((dependency) => {
    const fromOperationId = byRouting.get(dependency.fromOperationId);
    const toOperationId = byRouting.get(dependency.toOperationId);
    if (!fromOperationId || !toOperationId) return [];
    const fromRouting = routingById.get(dependency.fromOperationId);
    const completionLag = fromRouting
      ? Math.ceil((fromRouting.runMinutesPerBatch * fromRouting.minCompletionPercent) / 100)
      : 0;
    return [
      {
        fromOperationId,
        toOperationId,
        minimumLagMinutes: dependency.minimumLagMinutes + completionLag,
      },
    ];
  });
  const liveDependencies = liveOrders.flatMap((order) =>
    buildOrderOperationDependencies(order, dependencyRows)
  );

  const result = buildOperationSchedule({
    orders: [
      ...occupancy,
      {
        id: virtualId,
        orderNumber: virtualId,
        priority: input.priority ?? "NORMAL",
        dueDate,
        createdAt: windowStart,
        operations: virtualOps,
      },
    ],
    dependencies: [...liveDependencies, ...simDependencies],
    workstations: mapWorkstationsForScheduler(workstationRows, calendars, changeoverRows),
    changeovers: changeoverRows,
    windowStart,
    freezeUntil,
    weights: policyToWeights(policy),
  });
  const simulated = result.operations.filter((operation) => operation.orderId === virtualId);
  const feasibleEnd = simulated.reduce<Date | null>((latest, operation) => {
    if (!operation.plannedEnd) return latest;
    if (!latest || operation.plannedEnd.getTime() > latest.getTime()) return operation.plannedEnd;
    return latest;
  }, null);
  const blocked = simulated.every((operation) => !operation.plannedStart);
  const late = Boolean(feasibleEnd && feasibleEnd.getTime() > dueDate.getTime());
  return {
    productName: product.name,
    sku: product.sku,
    quantity: input.quantity,
    feasibleEnd: feasibleEnd?.toISOString() ?? null,
    atRisk: late,
    blocked,
    late,
    operations: simulated.map((operation) => ({
      code: routing.operations.find((row) => `sim-${row.id}` === operation.id)?.code ?? operation.id,
      name: routing.operations.find((row) => `sim-${row.id}` === operation.id)?.name ?? operation.id,
      workstationId: operation.workstationId,
      plannedStart: operation.plannedStart?.toISOString() ?? null,
      plannedEnd: operation.plannedEnd?.toISOString() ?? null,
      changeoverMinutes: operation.changeoverMinutes,
    })),
    issues: result.issues.filter((issue) => issue.orderNumber === virtualId).map((issue) => issue.detail),
  };
}

export async function exportProductionSchedule(ctx: TenantContext) {
  requirePermission(ctx, "production.read");
  const prisma = getPrisma();
  const orders = await prisma.productionOrder.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      product: { select: { sku: true, name: true } },
      workstation: { select: { code: true, name: true } },
      operations: {
        include: { workstation: { select: { code: true } } },
        orderBy: { sequence: "asc" },
      },
    },
    orderBy: [{ plannedStart: "asc" }, { orderNumber: "asc" }],
  });
  return {
    exportedAt: new Date().toISOString(),
    format: "pharmora.production-schedule.v1",
    orders: orders.map((order) => ({
      orderNumber: order.orderNumber,
      sku: order.product.sku,
      productName: order.product.name,
      quantity: order.quantity,
      priority: order.priority,
      status: order.status,
      dueDate: order.dueDate.toISOString(),
      plannedStart: order.plannedStart?.toISOString() ?? null,
      plannedEnd: order.plannedEnd?.toISOString() ?? null,
      workstationCode: order.workstation?.code ?? null,
      locked: order.isLocked,
      operations: order.operations.map((operation) => ({
        sequence: operation.sequence,
        code: operation.operationCode,
        name: operation.operationName,
        workstationCode: operation.workstation?.code ?? null,
        plannedStart: operation.plannedStart?.toISOString() ?? null,
        plannedEnd: operation.plannedEnd?.toISOString() ?? null,
        status: operation.status,
      })),
    })),
  };
}

export async function importProductionOrders(
  ctx: TenantContext,
  orders: Array<{
    orderNumber?: string;
    sku: string;
    quantity: number;
    dueDate: string;
    priority?: RoutingOrder["priority"];
  }>,
  options?: { idempotencyKey?: string }
) {
  requirePermission(ctx, "production.schedule");
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new ServerError("At least one production order is required.", "INTERNAL");
  }
  const prisma = getPrisma();
  const idempotencyKey = options?.idempotencyKey?.trim();
  if (idempotencyKey) {
    const receipt = await prisma.integrationImportReceipt.findUnique({
      where: {
        tenantId_source_idempotencyKey: {
          tenantId: ctx.tenantId,
          source: "production-orders",
          idempotencyKey,
        },
      },
    });
    if (receipt?.result) {
      return receipt.result as { imported: number; orders: Array<{ orderNumber: string; sku: string }> };
    }
  }
  const created: Array<{ orderNumber: string; sku: string }> = [];
  for (const row of orders) {
    const product = await prisma.product.findFirst({
      where: { tenantId: ctx.tenantId, sku: row.sku, status: "ACTIVE" },
    });
    if (!product) throw new ServerError(`Unknown SKU ${row.sku}.`, "NOT_FOUND");
    const dueDate = new Date(row.dueDate);
    if (Number.isNaN(dueDate.getTime())) throw new ServerError(`Invalid due date for ${row.sku}.`, "INTERNAL");
    if (!Number.isInteger(row.quantity) || row.quantity <= 0) {
      throw new ServerError(`Invalid quantity for ${row.sku}.`, "INTERNAL");
    }
    const year = new Date().getUTCFullYear();
    const orderCount = await prisma.productionOrder.count({ where: { tenantId: ctx.tenantId } });
    const orderNumber = row.orderNumber?.trim() || `PRO-${year}-${String(orderCount + 1).padStart(3, "0")}`;
    const duplicate = await prisma.productionOrder.findFirst({
      where: { tenantId: ctx.tenantId, orderNumber },
    });
    if (duplicate) throw new ServerError(`Order ${orderNumber} already exists.`, "INTERNAL");
    const routing = await prisma.productRouting.findFirst({
      where: { tenantId: ctx.tenantId, productId: product.id, active: true },
      include: { operations: true },
      orderBy: { version: "desc" },
    });
    const durationMinutes =
      routing?.operations.reduce((sum, operation) => sum + operation.runMinutesPerBatch, 0) ?? 480;
    const order = await prisma.productionOrder.create({
      data: {
        tenantId: ctx.tenantId,
        orderNumber,
        productId: product.id,
        quantity: row.quantity,
        priority: row.priority ?? "NORMAL",
        status: "UNSCHEDULED",
        dueDate,
        durationMinutes,
        isLocked: false,
      },
    });
    await prisma.productionBatch.create({
      data: {
        tenantId: ctx.tenantId,
        productionOrderId: order.id,
        batchNumber: `LAB-${year}-${String((await prisma.productionBatch.count({ where: { tenantId: ctx.tenantId } })) + 1).padStart(3, "0")}`,
        plannedQuantity: order.quantity,
        qualityStatus: "PENDING_REVIEW",
      },
    });
    await instantiateOperationsForOrder(prisma, ctx.tenantId, order);
    created.push({ orderNumber, sku: row.sku });
  }
  const payload = { imported: created.length, orders: created };
  await writeAuditLog(ctx, {
    action: "PRODUCTION_ORDERS_IMPORTED",
    entityType: "PRODUCTION_ORDER",
    newValue: `${created.length} orders`,
  });
  await writePlanningEvent(ctx, {
    eventType: "IMPORTED",
    summary: `Imported ${created.length} production order(s) via integration contract.`,
  });
  if (idempotencyKey) {
    await prisma.integrationImportReceipt.create({
      data: {
        tenantId: ctx.tenantId,
        source: "production-orders",
        idempotencyKey,
        result: payload,
      },
    });
  }
  return payload;
}
