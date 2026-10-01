import type { ProductionOrderStatus } from "@prisma/client";

import type { MaterialsSnapshot } from "@/lib/materials/types";
import {
  addWorkingMinutes,
  alignToWork,
  buildSchedule,
  utilizationPercent,
  type PlannerOrder,
  type PlannerWorkstation,
  type ScheduleConflict,
  type ScheduledOrder,
} from "@/lib/operations/schedule";
import {
  buildPlanningAttention,
  capacityStateFromUtilization,
  computeOrderMaterialReadiness,
  isPlanningMutableStatus,
  type MaterialReadinessState,
  type PlanningAttentionItem,
} from "@/lib/operations/planning";
import { getBatchesSnapshot } from "@/lib/server/batches";
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
  materialShortageCount: number;
  materialAffected: string[];
  capacityState: "OK" | "WARNING" | "DANGER" | "UNKNOWN";
  conflictCount: number;
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
  const [workstationRows, inactiveWorkstations, orderRows] = await Promise.all([
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
      },
      orderBy: [{ plannedStart: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const workstations: PlannerWorkstation[] = workstationRows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    capacityHoursPerDay: row.capacityHoursPerDay,
  }));

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
  }));

  const inactiveIds = new Set(inactiveWorkstations.map((row) => row.id));
  const planned = buildSchedule(plannerOrders, workstations, window, { inactiveWorkstationIds: inactiveIds });
  const conflicts = planned.conflicts;

  const days = Math.max(1, Math.round((window.end.getTime() - window.start.getTime()) / (24 * 60 * 60 * 1000)));
  const names = new Map(workstationRows.map((row) => [row.id, row.name]));
  const quantities = new Map(orderRows.map((row) => [row.id, row.quantity]));
  const produced = new Map(orderRows.map((row) => [row.id, row.batch?.producedQuantity ?? null]));
  const statuses = new Map(orderRows.map((row) => [row.id, row.status]));
  const productIds = new Map(orderRows.map((row) => [row.id, row.product.id]));

  const workstationViews = workstations.map((ws) => {
    const scheduledMinutes = planned.orders
      .filter((order) => order.workstationId === ws.id && order.plannedStart && order.plannedEnd)
      .reduce((sum, order) => {
        const start = Math.max(order.plannedStart!.getTime(), window.start.getTime());
        const end = Math.min(order.plannedEnd!.getTime(), window.end.getTime());
        return sum + Math.max(0, (end - start) / 60000);
      }, 0);
    const availableMinutes = days * ws.capacityHoursPerDay * 60;
    const utilization = utilizationPercent(scheduledMinutes, availableMinutes);
    return {
      ...ws,
      scheduledHours: Math.round(scheduledMinutes / 60),
      availableHours: days * ws.capacityHoursPerDay,
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
    const orderConflicts = conflicts.filter((item) => item.orderNumber === row.orderNumber || item.orderNumber === "");
    const utilization = row.workstationId ? wsUtilById.get(row.workstationId) ?? 0 : 0;
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
      materialShortageCount: readiness.shortageCount,
      materialAffected: readiness.affectedMaterials,
      capacityState: row.workstationId ? capacityStateFromUtilization(utilization) : "UNKNOWN",
      conflictCount: orderConflicts.filter((item) => item.orderNumber === row.orderNumber).length,
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
  };
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

  const workstations = await prisma.workstation.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    orderBy: { code: "asc" },
  });
  if (workstations.length === 0) throw new ServerError("No active workstations available.", "INTERNAL");

  const windowStart = parseScheduleDate(windowStartIso, "Window start");
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

  const hoursPerDay = preferred.capacityHoursPerDay;
  const cursor = lineOrders[0]?.plannedEnd ?? alignToWork(windowStart, hoursPerDay);
  const start = alignToWork(cursor, hoursPerDay);
  const end = addWorkingMinutes(start, order.durationMinutes, hoursPerDay);

  return updateProductionOrderSchedule(ctx, orderId, {
    workstationId: preferred.id,
    plannedStart: start.toISOString(),
    plannedEnd: end.toISOString(),
  });
}
