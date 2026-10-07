import type { ProductionOrderStatus } from "@prisma/client";

import type { MaterialsSnapshot } from "@/lib/materials/types";
import {
  addWorkingMinutesOnCalendar,
  alignToCalendar,
  availableWorkingMinutes,
  createStandardWorkCalendar,
} from "@/lib/operations/calendar";
import {
  getActiveProposal,
  getOrCreatePlanningPolicy,
  instantiateOperationsForOrder,
  loadWorkstationCalendars,
  type PlanningPolicyView,
  type ScheduleProposalView,
} from "@/lib/server/aps-plan";
import {
  buildSchedule,
  utilizationPercent,
  type PlannerOrder,
  type PlannerWorkstation,
  type ScheduleConflict,
  type ScheduledOrder,
} from "@/lib/operations/schedule";
import { buildOperationSchedule } from "@/lib/operations/routing";
import {
  buildOrderMaterialConstraints,
  type MaterialScheduleState,
  type OrderMaterialConstraint,
} from "@/lib/operations/material-constraints";
import {
  buildPlanningAttention,
  capacityStateFromUtilization,
  computeOrderMaterialReadiness,
  isPlanningMutableStatus,
  type MaterialReadinessState,
  type PlanningAttentionItem,
} from "@/lib/operations/planning";
import { getBatchesSnapshot } from "@/lib/server/batches";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { getTraceabilityAttention } from "@/lib/server/traceability";
import { getQualityAttention } from "@/lib/server/quality";
import { requirePermission, can } from "@/lib/auth/authorization";
import { formatStateChange, writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";

export type OperationsWindow = {
  start: Date;
  end: Date;
  weeks: 1 | 2 | 4;
};

export type OperationsKpi = {
  id: string;
  label: string;
  value: string;
  hint?: string;
};

export type OperationsOrder = {
  id: string;
  orderNumber: string;
  productName: string;
  productId: string;
  workstationId: string | null;
  workstationName: string | null;
  durationMinutes: number;
  quantity: number;
  producedQuantity: number | null;
  priority: ScheduledOrder["priority"];
  status: ProductionOrderStatus;
  isLocked: boolean;
  displayStatus: ScheduledOrder["displayStatus"];
  plannedStart: string | null;
  plannedEnd: string | null;
  dueDate: string;
  materialReadiness: MaterialReadinessState;
  materialScheduleState: MaterialScheduleState;
  materialReadyAt: string | null;
  materialShortageCount: number;
  materialAffected: string[];
  capacityState: "OK" | "WARNING" | "DANGER" | "UNKNOWN";
  conflictCount: number;
  routing: {
    name: string | null;
    version: number | null;
    issueCount: number;
    changeoverMinutes: number;
    operations: Array<{
      id: string;
      code: string;
      name: string;
      sequence: number;
      status: string;
      workstationId: string | null;
      workstationName: string | null;
      qualifiedWorkstationIds: string[];
      durationMinutes: number;
      setupMinutes: number;
      teardownMinutes: number;
      changeoverMinutes: number;
      plannedStart: string | null;
      plannedEnd: string | null;
    }>;
  };
};

export type OperationsView = {
  brand: string;
  disclaimer: string;
  window: { start: string; end: string; weeks: 1 | 2 | 4 };
  kpis: OperationsKpi[];
  workstations: Array<
    PlannerWorkstation & {
      scheduledHours: number;
      availableHours: number;
      utilization: number;
      capacityState: "OK" | "WARNING" | "DANGER";
    }
  >;
  orders: OperationsOrder[];
  conflicts: ScheduleConflict[];
  attention: ScheduleConflict[];
  planningAttention: PlanningAttentionItem[];
  workstationsActive: Array<{ id: string; name: string; code: string }>;
  capabilities: {
    canSchedule: boolean;
    canExecute: boolean;
  };
  products: Array<{ id: string; name: string; sku: string }>;
  policy: PlanningPolicyView;
  proposal: ScheduleProposalView | null;
};

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function resolvePlanningWindow(input?: { start?: string; weeks?: string }): OperationsWindow {
  const weeks = input?.weeks === "2" || input?.weeks === "4" ? (Number(input.weeks) as 2 | 4) : 1;
  const parsed = input?.start ? new Date(`${input.start}T00:00:00.000Z`) : startOfUtcDay(new Date());
  const start = Number.isNaN(parsed.getTime()) ? startOfUtcDay(new Date()) : startOfUtcDay(parsed);
  const end = new Date(start.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  return { start, end, weeks };
}

function orderHasBomDemand(productId: string, materials: MaterialsSnapshot | null | undefined): boolean {
  if (!materials?.materials.length) return false;
  return materials.materials.some((row) => row.affectedOrders.some((order) => order.productId === productId));
}

export async function getOperationsPlanner(
  ctx: TenantContext,
  window: OperationsWindow,
  materials?: MaterialsSnapshot | null
): Promise<OperationsView> {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, status: true } });
  const [workstationRows, inactiveWorkstations, orderRows, dependencyRows, changeoverRows, policy, proposal] =
    await Promise.all([
    prisma.workstation.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { code: "asc" },
    }),
    prisma.workstation.findMany({
      where: { tenantId: ctx.tenantId, active: false },
      select: { id: true },
    }),
    prisma.productionOrder.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        product: { select: { name: true, id: true } },
        workstation: { select: { name: true } },
        batch: { select: { producedQuantity: true } },
        operations: {
          include: {
            routingOperation: {
              include: {
                resources: true,
                routing: { select: { name: true, version: true } },
              },
            },
          },
          orderBy: { sequence: "asc" },
        },
      },
      orderBy: [{ plannedStart: "asc" }, { createdAt: "asc" }],
    }),
    prisma.routingDependency.findMany({ where: { tenantId: ctx.tenantId } }),
    prisma.changeoverRule.findMany({ where: { tenantId: ctx.tenantId } }),
    getOrCreatePlanningPolicy(ctx),
    getActiveProposal(ctx),
  ]);
  const calendars = await loadWorkstationCalendars(ctx.tenantId, workstationRows);

  const workstations: PlannerWorkstation[] = workstationRows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    capacityHoursPerDay: row.capacityHoursPerDay,
    calendar: calendars.get(row.id) ?? createStandardWorkCalendar(row.capacityHoursPerDay),
  }));

  const materialConstraints = buildOrderMaterialConstraints(
    materials?.materials ?? [],
    orderRows.map((order) => order.id),
    materials?.generatedAt ? new Date(materials.generatedAt) : new Date()
  );
  const plannerOrders: PlannerOrder[] = orderRows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    productName: row.product.name,
    workstationId: row.workstationId,
    durationMinutes: row.durationMinutes,
    priority: row.priority,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
    isLocked: row.isLocked,
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    materialReadyAt: materialConstraints.get(row.id)?.readyAt ?? null,
    materialBlocked: materialConstraints.get(row.id)?.state === "BLOCKED",
  }));

  const inactiveIds = new Set(inactiveWorkstations.map((row) => row.id));
  const planned = buildSchedule(plannerOrders, workstations, window, { inactiveWorkstationIds: inactiveIds });
  const conflicts = planned.conflicts;

  const concreteDependencies = orderRows.flatMap((order) => {
    const byRoutingOperation = new Map(
      order.operations
        .filter((operation) => operation.routingOperationId)
        .map((operation) => [operation.routingOperationId!, operation.id])
    );
    return dependencyRows.flatMap((dependency) => {
      const fromOperationId = byRoutingOperation.get(dependency.fromOperationId);
      const toOperationId = byRoutingOperation.get(dependency.toOperationId);
      if (!fromOperationId || !toOperationId) return [];
      return [{ fromOperationId, toOperationId, minimumLagMinutes: dependency.minimumLagMinutes }];
    });
  });
  const operationPlan = buildOperationSchedule({
    orders: orderRows
      .filter((order) => order.operations.length > 0)
      .map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        priority: order.priority,
        dueDate: order.dueDate,
        createdAt: order.createdAt,
        materialReadyAt: materialConstraints.get(order.id)?.readyAt ?? null,
        materialBlocked: materialConstraints.get(order.id)?.state === "BLOCKED",
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
            })) ?? [],
          locked:
            operation.isLocked ||
            (operation.plannedStart != null &&
              operation.plannedStart.getTime() < new Date(policy.freezeUntil).getTime()),
          workstationId: operation.workstationId,
          plannedStart: operation.plannedStart,
          plannedEnd: operation.plannedEnd,
        })),
      })),
    dependencies: concreteDependencies,
    workstations,
    changeovers: changeoverRows,
    windowStart: window.start,
    freezeUntil: new Date(policy.freezeUntil),
    weights: {
      priorityWeight: policy.priorityWeight,
      dueDateWeight: policy.dueDateWeight,
      changeoverWeight: policy.changeoverWeight,
      utilizationWeight: policy.utilizationWeight,
    },
  });
  const plannedOperationsByOrder = new Map<string, typeof operationPlan.operations>();
  for (const operation of operationPlan.operations) {
    const group = plannedOperationsByOrder.get(operation.orderId) ?? [];
    group.push(operation);
    plannedOperationsByOrder.set(operation.orderId, group);
  }
  const routingIssuesByOrderNumber = new Map<string, number>();
  for (const issue of operationPlan.issues) {
    routingIssuesByOrderNumber.set(
      issue.orderNumber,
      (routingIssuesByOrderNumber.get(issue.orderNumber) ?? 0) + 1
    );
  }

  const names = new Map(workstationRows.map((row) => [row.id, row.name]));
  const quantities = new Map(orderRows.map((row) => [row.id, row.quantity]));
  const produced = new Map(orderRows.map((row) => [row.id, row.batch?.producedQuantity ?? null]));
  const statuses = new Map(orderRows.map((row) => [row.id, row.status]));
  const productIds = new Map(orderRows.map((row) => [row.id, row.product.id]));
  const operationRowsById = new Map(
    orderRows.flatMap((order) => order.operations.map((operation) => [operation.id, operation] as const))
  );

  const workstationViews = workstations.map((ws) => {
    const scheduledMinutes = planned.orders
      .filter((order) => order.workstationId === ws.id && order.plannedStart && order.plannedEnd)
      .reduce((sum, order) => {
        const start = Math.max(order.plannedStart!.getTime(), window.start.getTime());
        const end = Math.min(order.plannedEnd!.getTime(), window.end.getTime());
        return sum + Math.max(0, (end - start) / 60000);
      }, 0);
    const calendar = ws.calendar ?? createStandardWorkCalendar(ws.capacityHoursPerDay);
    const availableMinutes = availableWorkingMinutes(window.start, window.end, calendar);
    const utilization = utilizationPercent(scheduledMinutes, availableMinutes);
    return {
      ...ws,
      scheduledHours: Math.round(scheduledMinutes / 60),
      availableHours: Math.round((availableMinutes / 60) * 10) / 10,
      utilization,
      capacityState: capacityStateFromUtilization(utilization),
    };
  });

  const wsUtilById = new Map(workstationViews.map((row) => [row.id, row.utilization]));

  const orders: OperationsOrder[] = planned.orders.map((row) => {
    const readiness = computeOrderMaterialReadiness(
      materials?.materials ?? [],
      row.id,
      orderHasBomDemand(productIds.get(row.id) ?? "", materials)
    );
    const materialConstraint = materialConstraints.get(row.id);
    const orderConflicts = conflicts.filter((item) => item.orderNumber === row.orderNumber || item.orderNumber === "");
    const utilization = row.workstationId ? wsUtilById.get(row.workstationId) ?? 0 : 0;
    const sourceOrder = orderRows.find((order) => order.id === row.id);
    const routeOperations = (plannedOperationsByOrder.get(row.id) ?? []).sort(
      (a, b) => a.sequence - b.sequence
    );
    const route = sourceOrder?.operations[0]?.routingOperation?.routing;
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      productName: row.productName,
      productId: productIds.get(row.id) ?? "",
      workstationId: row.workstationId,
      workstationName: row.workstationId ? names.get(row.workstationId) ?? null : null,
      durationMinutes: row.durationMinutes,
      quantity: quantities.get(row.id) ?? 0,
      producedQuantity: produced.get(row.id) ?? null,
      priority: row.priority,
      status: statuses.get(row.id) ?? "UNSCHEDULED",
      isLocked: row.isLocked,
      displayStatus: row.displayStatus,
      plannedStart: row.plannedStart?.toISOString() ?? null,
      plannedEnd: row.plannedEnd?.toISOString() ?? null,
      dueDate: row.dueDate.toISOString(),
      materialReadiness: readiness.state,
      materialScheduleState: materialConstraint?.state ?? "UNKNOWN",
      materialReadyAt: materialConstraint?.readyAt?.toISOString() ?? null,
      materialShortageCount: readiness.shortageCount,
      materialAffected: readiness.affectedMaterials,
      capacityState: row.workstationId ? capacityStateFromUtilization(utilization) : "UNKNOWN",
      conflictCount: orderConflicts.filter((item) => item.orderNumber === row.orderNumber).length,
      routing: {
        name: route?.name ?? null,
        version: route?.version ?? null,
        issueCount: routingIssuesByOrderNumber.get(row.orderNumber) ?? 0,
        changeoverMinutes: routeOperations.reduce(
          (sum, operation) => sum + operation.changeoverMinutes,
          0
        ),
        operations: routeOperations.map((operation) => {
          const source = operationRowsById.get(operation.id);
          return {
            id: operation.id,
            code: source?.operationCode ?? "",
            name: source?.operationName ?? "",
            sequence: operation.sequence,
            status: source?.status ?? "UNSCHEDULED",
            workstationId: operation.workstationId,
            workstationName: operation.workstationId ? names.get(operation.workstationId) ?? null : null,
            qualifiedWorkstationIds:
              source?.routingOperation?.resources.map((resource) => resource.workstationId) ?? [],
            durationMinutes: operation.durationMinutes,
            setupMinutes: operation.setupMinutes,
            teardownMinutes: operation.teardownMinutes,
            changeoverMinutes: operation.changeoverMinutes,
            plannedStart: operation.plannedStart?.toISOString() ?? null,
            plannedEnd: operation.plannedEnd?.toISOString() ?? null,
          };
        }),
      },
    };
  });

  const scheduled = orders.filter((row) => row.displayStatus !== "UNSCHEDULED");
  const atRisk = orders.filter((row) => row.displayStatus === "AT_RISK");
  const unscheduled = orders.filter((row) => row.displayStatus === "UNSCHEDULED");
  const materialShortageOrders = orders.filter((row) => row.materialReadiness === "SHORTAGE").length;
  const missingReview = conflicts.filter((row) => row.kind === "missing-info" || row.kind === "invalid-duration").length;
  const overCapacityWorkstations = conflicts.filter((row) => row.kind === "over-capacity").length;
  const highUtilizationWorkstations = workstationViews.filter((row) => row.capacityState === "WARNING").length;
  const plannedQuantity = orders.reduce((sum, row) => sum + row.quantity, 0);

  const productionHours = Math.round(
    planned.orders.reduce((sum, row) => {
      if (!row.plannedStart || !row.plannedEnd) return sum;
      return sum + Math.max(0, (row.plannedEnd.getTime() - row.plannedStart.getTime()) / 3600000);
    }, 0)
  );
  const avgUtilization =
    workstationViews.length === 0
      ? 0
      : Math.round(workstationViews.reduce((sum, row) => sum + row.utilization, 0) / workstationViews.length);

  const planningAttentionBase = buildPlanningAttention({
    conflicts,
    materialShortageOrderCount: materialShortageOrders,
    unscheduledCount: unscheduled.length,
    missingReviewCount: missingReview,
    overCapacityWorkstations,
    highUtilizationWorkstations,
  });
  const batchSnapshot = await getBatchesSnapshot(ctx, { view: "all" }).catch(() => null);
  const traceabilityItems = await getTraceabilityAttention(ctx).catch(() => []);
  const qualityItems = await getQualityAttention(ctx).catch(() => []);
  const batchAttention: PlanningAttentionItem[] = (batchSnapshot?.attention ?? []).map((item) => ({
    id: item.id,
    severity: item.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
    title: item.title,
    detail: item.detail,
    count: 1,
    href: item.href,
    view: "attention",
    focus: "material",
  }));
  const traceabilityAttention: PlanningAttentionItem[] = traceabilityItems.map((item) => ({
    id: item.id,
    severity: item.severity === "CRITICAL" ? "CRITICAL" : item.severity === "HIGH" ? "WARNING" : "WARNING",
    title: item.title,
    detail: item.detail,
    count: 1,
    href: item.href,
    view: "attention",
    focus: "material",
  }));
  const qualityAttention: PlanningAttentionItem[] = qualityItems.map((item) => ({
    id: item.id,
    severity: item.severity === "CRITICAL" ? "CRITICAL" : item.severity === "HIGH" ? "WARNING" : "WARNING",
    title: item.title,
    detail: item.detail,
    count: 1,
    href: item.href,
    view: "attention",
    focus: "material",
  }));
  const planningAttention = [...planningAttentionBase, ...batchAttention, ...traceabilityAttention, ...qualityAttention];

  const productRows = await prisma.product.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE", dosageForm: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true },
  });

  return {
    brand: tenant?.name ?? "Workspace",
    disclaimer: tenant?.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    window: { start: window.start.toISOString(), end: window.end.toISOString(), weeks: window.weeks },
    kpis: [
      { id: "scheduled", label: "Orders scheduled", value: String(scheduled.length), hint: "In this window" },
      { id: "at-risk", label: "Orders at risk", value: String(atRisk.length), hint: "Past due when planned" },
      { id: "utilization", label: "Avg capacity", value: `${avgUtilization}%`, hint: "Finite-capacity utilization" },
      { id: "material-shortage", label: "Material shortage", value: String(materialShortageOrders), hint: "Confirmed shortages" },
      { id: "over-capacity", label: "Lines over capacity", value: String(overCapacityWorkstations), hint: "Daily load exceeded" },
      { id: "planned-qty", label: "Planned quantity", value: plannedQuantity.toLocaleString("en-GB"), hint: "Units in scope" },
      { id: "hours", label: "Production hours", value: `${productionHours}h`, hint: "Scheduled run time" },
      { id: "unscheduled", label: "Unscheduled", value: String(unscheduled.length), hint: "Not on the Gantt" },
    ],
    workstations: workstationViews,
    orders,
    conflicts,
    attention: conflicts.slice(0, 8),
    planningAttention,
    workstationsActive: workstationRows.map((row) => ({ id: row.id, name: row.name, code: row.code })),
    capabilities: {
      canSchedule: can(ctx.role, "production.schedule"),
      canExecute: can(ctx.role, "production.execute"),
    },
    products: productRows.filter((row) => !row.sku.includes("API") && !row.sku.startsWith("BLISTER") && !row.sku.startsWith("LABEL")),
    policy,
    proposal,
  };
}

export type CreateProductionOrderInput = {
  productId: string;
  quantity: number;
  priority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  dueDate: string;
  durationMinutes?: number;
};

export async function createProductionOrder(ctx: TenantContext, input: CreateProductionOrderInput) {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const product = await prisma.product.findFirst({
    where: { id: input.productId, tenantId: ctx.tenantId, status: "ACTIVE" },
  });
  if (!product) throw new ServerError("Product not found.", "NOT_FOUND");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ServerError("Quantity must be a positive whole number.", "INTERNAL");
  }
  const dueDate = parseScheduleDate(input.dueDate, "Due date");
  const durationMinutes = input.durationMinutes ?? 480;
  const year = new Date().getUTCFullYear();
  const orderCount = await prisma.productionOrder.count({ where: { tenantId: ctx.tenantId } });
  const orderNumber = `PRO-${year}-${String(orderCount + 1).padStart(3, "0")}`;
  const batchCount = await prisma.productionBatch.count({ where: { tenantId: ctx.tenantId } });
  const batchNumber = `LAB-${year}-${String(batchCount + 1).padStart(3, "0")}`;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.productionOrder.create({
      data: {
        tenantId: ctx.tenantId,
        orderNumber,
        productId: product.id,
        quantity: input.quantity,
        priority: input.priority ?? "NORMAL",
        status: "UNSCHEDULED",
        dueDate,
        durationMinutes,
        isLocked: false,
      },
    });
    await tx.productionBatch.create({
      data: {
        tenantId: ctx.tenantId,
        productionOrderId: created.id,
        batchNumber,
        plannedQuantity: created.quantity,
        qualityStatus: "PENDING_REVIEW",
      },
    });
    await instantiateOperationsForOrder(tx, ctx.tenantId, created);
    return created;
  });

  await writeAuditLog(ctx, {
    action: "PRODUCTION_ORDER_CREATED",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    newValue: orderNumber,
  });

  return { id: order.id, orderNumber, batchNumber };
}

export type ScheduleUpdateInput = {
  plannedStart?: string;
  plannedEnd?: string;
  workstationId?: string | null;
};

export type ResequenceDirection = "earlier" | "later";

function requireUser(ctx: TenantContext): string {
  if (!ctx.userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  return ctx.userId;
}

async function loadMutableOrder(ctx: TenantContext, orderId: string) {
  const prisma = getPrisma();
  const order = await prisma.productionOrder.findFirst({
    where: { id: orderId, tenantId: ctx.tenantId },
    include: { workstation: { select: { id: true, active: true, capacityHoursPerDay: true } } },
  });
  if (!order) throw new ServerError("Production order not found.", "NOT_FOUND");
  if (order.isLocked) throw new ServerError("Locked production orders cannot be replanned.", "FORBIDDEN");
  if (!isPlanningMutableStatus(order.status)) {
    throw new ServerError(`Production order status ${order.status} cannot be replanned.`, "FORBIDDEN");
  }
  return order;
}

function parseScheduleDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ServerError(`${label} is not a valid date.`, "INTERNAL");
  return date;
}

async function loadMaterialConstraints(ctx: TenantContext, orderIds: string[]) {
  const materials = await getMaterialsSnapshot(ctx, resolveMaterialsFilters({}));
  return buildOrderMaterialConstraints(
    materials.materials,
    orderIds,
    new Date(materials.generatedAt)
  );
}

function assertMaterialFeasible(
  orderNumber: string,
  plannedStart: Date | null,
  constraint: OrderMaterialConstraint
) {
  if (!plannedStart) return;
  if (constraint.state === "BLOCKED") {
    throw new ServerError(
      `Cannot schedule ${orderNumber}: dated material supply is insufficient.`,
      "INTERNAL"
    );
  }
  if (
    constraint.state === "DELAYED" &&
    constraint.readyAt &&
    plannedStart.getTime() < constraint.readyAt.getTime()
  ) {
    throw new ServerError(
      `Cannot schedule ${orderNumber} before materials are available on ${constraint.readyAt.toISOString()}.`,
      "INTERNAL"
    );
  }
}

export async function updateProductionOrderSchedule(ctx: TenantContext, orderId: string, input: ScheduleUpdateInput) {
  requirePermission(ctx, "production.schedule");
  const order = await loadMutableOrder(ctx, orderId);
  const prisma = getPrisma();

  const plannedStart = input.plannedStart ? parseScheduleDate(input.plannedStart, "Planned start") : order.plannedStart;
  const plannedEnd = input.plannedEnd ? parseScheduleDate(input.plannedEnd, "Planned end") : order.plannedEnd;
  const workstationId = input.workstationId !== undefined ? input.workstationId : order.workstationId;

  if (plannedStart && plannedEnd && plannedStart.getTime() >= plannedEnd.getTime()) {
    throw new ServerError("Planned start must be before planned end.", "INTERNAL");
  }
  const materialConstraint = (await loadMaterialConstraints(ctx, [order.id])).get(order.id);
  if (materialConstraint) assertMaterialFeasible(order.orderNumber, plannedStart, materialConstraint);

  if (workstationId) {
    const workstation = await prisma.workstation.findFirst({
      where: { id: workstationId, tenantId: ctx.tenantId },
      select: { id: true, active: true },
    });
    if (!workstation) throw new ServerError("Workstation not found.", "NOT_FOUND");
    if (!workstation.active) throw new ServerError("Workstation is inactive.", "FORBIDDEN");
  }

  const nextStatus =
    order.status === "UNSCHEDULED" && plannedStart && plannedEnd && workstationId ? "SCHEDULED" : order.status;

  const updated = await prisma.productionOrder.update({
    where: { id: order.id },
    data: {
      plannedStart,
      plannedEnd,
      workstationId,
      status: nextStatus,
    },
    select: { id: true, orderNumber: true, plannedStart: true, plannedEnd: true, workstationId: true, status: true },
  });

  await writeAuditLog(ctx, {
    action: "PRODUCTION_SCHEDULE_UPDATED",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    newValue: `STATUS: ${nextStatus}`,
  });

  return updated;
}

export async function resequenceProductionOrder(ctx: TenantContext, orderId: string, direction: ResequenceDirection) {
  requirePermission(ctx, "production.schedule");
  const order = await loadMutableOrder(ctx, orderId);
  if (!order.workstationId || !order.plannedStart || !order.plannedEnd) {
    throw new ServerError("Order must be scheduled on a workstation before resequencing.", "INTERNAL");
  }

  const prisma = getPrisma();
  const lineOrders = await prisma.productionOrder.findMany({
    where: {
      tenantId: ctx.tenantId,
      workstationId: order.workstationId,
      plannedStart: { not: null },
      plannedEnd: { not: null },
      status: { in: ["UNSCHEDULED", "SCHEDULED", "AT_RISK"] },
      isLocked: false,
    },
    orderBy: { plannedStart: "asc" },
    select: { id: true, plannedStart: true, plannedEnd: true, isLocked: true },
  });

  const index = lineOrders.findIndex((row) => row.id === order.id);
  if (index < 0) throw new ServerError("Order is not in the workstation sequence.", "INTERNAL");

  const neighborIndex = direction === "earlier" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= lineOrders.length) {
    throw new ServerError(direction === "earlier" ? "Order is already first on the line." : "Order is already last on the line.", "INTERNAL");
  }

  const current = lineOrders[index];
  const neighbor = lineOrders[neighborIndex];
  if (neighbor.isLocked) throw new ServerError("Cannot swap with a locked order.", "FORBIDDEN");
  const constraints = await loadMaterialConstraints(ctx, [current.id, neighbor.id]);
  const currentConstraint = constraints.get(current.id);
  const neighborConstraint = constraints.get(neighbor.id);
  if (currentConstraint) {
    assertMaterialFeasible(order.orderNumber, neighbor.plannedStart, currentConstraint);
  }
  if (neighborConstraint) {
    const neighborOrder = await prisma.productionOrder.findUnique({
      where: { id: neighbor.id },
      select: { orderNumber: true },
    });
    assertMaterialFeasible(
      neighborOrder?.orderNumber ?? "Production order",
      current.plannedStart,
      neighborConstraint
    );
  }

  await prisma.$transaction([
    prisma.productionOrder.update({
      where: { id: current.id },
      data: { plannedStart: neighbor.plannedStart, plannedEnd: neighbor.plannedEnd },
    }),
    prisma.productionOrder.update({
      where: { id: neighbor.id },
      data: { plannedStart: current.plannedStart, plannedEnd: current.plannedEnd },
    }),
  ]);

  await writeAuditLog(ctx, {
    action: "PRODUCTION_ORDER_RESEQUENCED",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    newValue: `DIRECTION: ${direction}; SWAPPED_WITH: ${neighbor.id}`,
  });

  return { id: order.id, direction, swappedWith: neighbor.id };
}

export async function autoScheduleProductionOrder(ctx: TenantContext, orderId: string, windowStartIso: string) {
  requirePermission(ctx, "production.schedule");
  const order = await loadMutableOrder(ctx, orderId);
  const prisma = getPrisma();
  const windowStart = parseScheduleDate(windowStartIso, "Window start");
  await instantiateOperationsForOrder(prisma, ctx.tenantId, order);
  const operations = await prisma.productionOperation.findMany({
    where: { productionOrderId: order.id },
    include: { routingOperation: { include: { resources: true } } },
    orderBy: { sequence: "asc" },
  });
  const materialConstraint = (await loadMaterialConstraints(ctx, [order.id])).get(order.id);
  if (materialConstraint?.state === "BLOCKED") {
    assertMaterialFeasible(order.orderNumber, windowStart, materialConstraint);
  }

  if (operations.length > 0) {
    const policy = await getOrCreatePlanningPolicy(ctx);
    const freezeUntil = new Date(policy.freezeUntil);
    const [workstationRows, occupancy, dependencyRows, changeoverRows] = await Promise.all([
      prisma.workstation.findMany({ where: { tenantId: ctx.tenantId, active: true } }),
      prisma.productionOrder.findMany({
        where: { tenantId: ctx.tenantId, status: { not: "COMPLETED" }, id: { not: order.id } },
        include: { operations: { include: { routingOperation: { include: { resources: true } } } } },
      }),
      prisma.routingDependency.findMany({ where: { tenantId: ctx.tenantId } }),
      prisma.changeoverRule.findMany({ where: { tenantId: ctx.tenantId } }),
    ]);
    const calendars = await loadWorkstationCalendars(ctx.tenantId, workstationRows);
    const toRouting = (
      row: typeof occupancy[number] | (typeof order & { operations: typeof operations }),
      ops: typeof operations,
      locked: boolean
    ) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      priority: row.priority,
      dueDate: row.dueDate,
      createdAt: row.createdAt,
      materialReadyAt: row.id === order.id ? materialConstraint?.readyAt ?? null : null,
      materialBlocked: row.id === order.id ? materialConstraint?.state === "BLOCKED" : false,
      operations: ops.map((operation) => ({
        id: operation.id,
        orderId: row.id,
        orderNumber: row.orderNumber,
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
          })) ?? [],
        locked,
        workstationId: operation.workstationId,
        plannedStart: operation.plannedStart,
        plannedEnd: operation.plannedEnd,
      })),
    });
    const dependencies = [...occupancy, { ...order, operations }].flatMap((row) => {
      const map = new Map(
        row.operations
          .filter((operation) => operation.routingOperationId)
          .map((operation) => [operation.routingOperationId!, operation.id])
      );
      return dependencyRows.flatMap((dependency) => {
        const fromOperationId = map.get(dependency.fromOperationId);
        const toOperationId = map.get(dependency.toOperationId);
        if (!fromOperationId || !toOperationId) return [];
        return [{ fromOperationId, toOperationId, minimumLagMinutes: dependency.minimumLagMinutes }];
      });
    });
    const result = buildOperationSchedule({
      orders: [
        ...occupancy
          .filter((row) => row.operations.length > 0)
          .map((row) => toRouting(row, row.operations, true)),
        toRouting({ ...order, operations }, operations, false),
      ],
      dependencies,
      workstations: workstationRows.map((row) => ({
        id: row.id,
        code: row.code,
        capacityHoursPerDay: row.capacityHoursPerDay,
        calendar: calendars.get(row.id),
      })),
      changeovers: changeoverRows,
      windowStart,
      freezeUntil,
      weights: {
        priorityWeight: policy.priorityWeight,
        dueDateWeight: policy.dueDateWeight,
        changeoverWeight: policy.changeoverWeight,
        utilizationWeight: policy.utilizationWeight,
      },
    });
    const scheduled = result.operations.filter((operation) => operation.orderId === order.id);
    const rolledStart = scheduled.reduce<Date | null>(
      (earliest, operation) =>
        operation.plannedStart && (!earliest || operation.plannedStart.getTime() < earliest.getTime())
          ? operation.plannedStart
          : earliest,
      null
    );
    const rolledEnd = scheduled.reduce<Date | null>(
      (latest, operation) =>
        operation.plannedEnd && (!latest || operation.plannedEnd.getTime() > latest.getTime())
          ? operation.plannedEnd
          : latest,
      null
    );
    const workstationId =
      [...scheduled].sort((a, b) => a.sequence - b.sequence)[0]?.workstationId ?? order.workstationId;
    await prisma.$transaction(
      scheduled.map((operation) =>
        prisma.productionOperation.update({
          where: { id: operation.id },
          data: {
            workstationId: operation.workstationId,
            plannedStart: operation.plannedStart,
            plannedEnd: operation.plannedEnd,
            status: operation.plannedStart ? "SCHEDULED" : "UNSCHEDULED",
          },
        })
      )
    );
    if (!rolledStart || !rolledEnd || !workstationId) {
      throw new ServerError(
        result.issues.find((issue) => issue.orderNumber === order.orderNumber)?.detail ??
          "Unable to auto-schedule this order against qualified resources.",
        "INTERNAL"
      );
    }
    return updateProductionOrderSchedule(ctx, orderId, {
      workstationId,
      plannedStart: rolledStart.toISOString(),
      plannedEnd: rolledEnd.toISOString(),
    });
  }

  const workstations = await prisma.workstation.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    orderBy: { code: "asc" },
  });
  if (workstations.length === 0) throw new ServerError("No active workstations available.", "INTERNAL");

  const preferred =
    order.workstationId && workstations.some((row) => row.id === order.workstationId)
      ? workstations.find((row) => row.id === order.workstationId)!
      : workstations[0];

  const lineOrders = await prisma.productionOrder.findMany({
    where: {
      tenantId: ctx.tenantId,
      workstationId: preferred.id,
      plannedEnd: { not: null },
      status: { not: "COMPLETED" },
    },
    orderBy: { plannedEnd: "desc" },
    take: 1,
    select: { plannedEnd: true },
  });

  const calendars = await loadWorkstationCalendars(ctx.tenantId, workstations);
  const calendar = calendars.get(preferred.id) ?? createStandardWorkCalendar(preferred.capacityHoursPerDay);
  const lineCursor = lineOrders[0]?.plannedEnd ?? alignToCalendar(windowStart, calendar);
  const cursor =
    materialConstraint?.readyAt && materialConstraint.readyAt.getTime() > lineCursor.getTime()
      ? materialConstraint.readyAt
      : lineCursor;
  const start = alignToCalendar(cursor, calendar);
  const end = addWorkingMinutesOnCalendar(start, order.durationMinutes, calendar);

  return updateProductionOrderSchedule(ctx, orderId, {
    workstationId: preferred.id,
    plannedStart: start.toISOString(),
    plannedEnd: end.toISOString(),
  });
}
