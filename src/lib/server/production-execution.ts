import { can, requirePermission } from "@/lib/auth/authorization";
import { resolvePlannerAccess } from "@/lib/auth/planner-access";
import {
  allowedActions,
  buildExecutionAttention,
  computeDurations,
  computeExecutionRisk,
  computeProgress,
  deriveExecutionState,
  mapHistoryEntries,
  resolveActualCompletion,
  resolveActualStart,
  validateProducedQuantity,
} from "@/lib/production-execution/service";
import {
  EXECUTION_AUDIT_ACTIONS,
  EXECUTION_VIEWS,
  type ExecutionOrderRow,
  type ExecutionViewId,
  type ProductionExecutionSnapshot,
} from "@/lib/production-execution/types";
import { formatStateChange, writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";
import { computeOrderMaterialReadiness } from "@/lib/operations/planning";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { filterOpenStationJobs, sortStationQueue } from "@/lib/production-execution/shop-floor";
import {
  loadOpenShopFloorTimerOperationIds,
  loadOpenShopFloorTimers,
} from "@/lib/server/active-shop-floor-timers";
import { countDeliveryLateOrders } from "@/lib/operations/schedule-issue-format";
import { isQaHoldOperation } from "@/lib/operations/elapsed-workstation";
import { listRecentShopFloorEvents, recordProductionOperationEvent } from "@/lib/server/production-operation-events";
import {
  resolveCurrentShopFloorOperation,
  shopFloorStepLabel,
} from "@/lib/operations/current-shop-floor-operation";
import { routingStepDisplayName } from "@/lib/operations/routing-step-labels";
import {
  PAUSE_REASON_LABELS,
  formatPauseReason,
  isDowntimePause,
  parsePauseReasonCode,
} from "@/lib/production-execution/pause-reasons";
import type { ShopFloorActionOptions } from "@/lib/production-execution/shop-floor-action-input";

export type ProductionExecutionFilters = {
  view: ExecutionViewId;
  orderId?: string;
  query?: string;
  workstationId?: string;
};

function parseView(value?: string): ExecutionViewId {
  return EXECUTION_VIEWS.includes(value as ExecutionViewId) ? (value as ExecutionViewId) : "all";
}

export function resolveProductionExecutionFilters(input: {
  view?: string;
  order?: string;
  q?: string;
  workstation?: string;
}): ProductionExecutionFilters {
  return {
    view: parseView(input.view),
    orderId: input.order?.trim() || undefined,
    query: input.q?.trim() || undefined,
    workstationId: input.workstation?.trim() || undefined,
  };
}

function matchesView(row: ExecutionOrderRow, view: ExecutionViewId): boolean {
  switch (view) {
    case "active":
      return row.executionState === "IN_PROGRESS";
    case "paused":
      return row.executionState === "PAUSED";
    case "waiting":
      return row.executionState === "WAITING" || row.executionState === "RELEASED";
    case "completed":
      return row.executionState === "COMPLETED";
    case "at-risk":
      return row.risk === "AT_RISK" || row.risk === "LATE" || row.risk === "BLOCKED";
    default:
      return true;
  }
}

async function loadExecutionOrders(ctx: TenantContext, options?: { includeMaterials?: boolean }) {
  const prisma = getPrisma();
  const orders = await prisma.productionOrder.findMany({
    where: {
      tenantId: ctx.tenantId,
      OR: [
        { status: { in: ["SCHEDULED", "AT_RISK", "IN_PROGRESS", "COMPLETED"] } },
        { plannedStart: { not: null } },
      ],
    },
    include: {
      product: { select: { id: true, name: true, sku: true, unit: true } },
      workstation: { select: { id: true, name: true, active: true } },
      batch: {
        select: {
          id: true,
          batchNumber: true,
          plannedQuantity: true,
          producedQuantity: true,
          productionStartedAt: true,
          productionCompletedAt: true,
        },
      },
      operations: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          operationCode: true,
          operationName: true,
          status: true,
          sequence: true,
          plannedStart: true,
          plannedEnd: true,
          workstationId: true,
          workstation: { select: { id: true, name: true, active: true } },
          routingOperation: { select: { requiresLineClearance: true } },
        },
      },
    },
    orderBy: [{ plannedEnd: "asc" }, { orderNumber: "asc" }],
  });

  const orderIds = orders.map((row) => row.id);
  const audits =
    orderIds.length === 0
      ? []
      : await prisma.auditLog.findMany({
          where: {
            tenantId: ctx.tenantId,
            entityType: "PRODUCTION_ORDER",
            entityId: { in: orderIds },
            action: { in: [...EXECUTION_AUDIT_ACTIONS] },
          },
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        });

  const auditsByOrder = new Map<string, typeof audits>();
  for (const audit of audits) {
    if (!audit.entityId) continue;
    const list = auditsByOrder.get(audit.entityId) ?? [];
    list.push(audit);
    auditsByOrder.set(audit.entityId, list);
  }

  let materials = null as Awaited<ReturnType<typeof getMaterialsSnapshot>> | null;
  if (options?.includeMaterials !== false) {
    try {
      materials = await getMaterialsSnapshot(ctx, resolveMaterialsFilters({}));
    } catch {
      materials = null;
    }
  }

  const now = new Date();
  const openTimerDetails = await loadOpenShopFloorTimers(ctx.tenantId);
  const openShopFloorTimers = new Set(openTimerDetails.keys());
  const canExecute = can(ctx.role, "production.execute");
  const activeOperationIds = orders
    .map((order) => resolveCurrentShopFloorOperation(order.operations, openShopFloorTimers)?.id ?? null)
    .filter((id): id is string => Boolean(id));
  const shopFloorEventsByOperation = await listRecentShopFloorEvents(ctx, activeOperationIds);

  const rows: ExecutionOrderRow[] = orders.map((order) => {
    const historyRows = auditsByOrder.get(order.id) ?? [];
    const history = mapHistoryEntries(historyRows);
    const plannedQuantity = order.batch?.plannedQuantity ?? order.quantity;
    const producedQuantity = order.batch?.producedQuantity ?? null;
    const hasInProgressOperation = order.operations.some((operation) => operation.status === "IN_PROGRESS");
    const hasOpenShopFloorTimer = order.operations.some((operation) => openShopFloorTimers.has(operation.id));
    const currentOp = resolveCurrentShopFloorOperation(order.operations, openShopFloorTimers);
    const overlay = {
      planningStatus: order.status,
      plannedStart: currentOp?.plannedStart ?? order.plannedStart,
      plannedEnd: currentOp?.plannedEnd ?? order.plannedEnd,
      workstationId: currentOp?.workstationId ?? order.workstationId,
      workstationActive: currentOp?.workstation?.active ?? order.workstation?.active ?? null,
      plannedQuantity,
      producedQuantity,
      productionStartedAt: order.batch?.productionStartedAt ?? null,
      productionCompletedAt: order.batch?.productionCompletedAt ?? null,
      history: historyRows.map((row) => ({ action: row.action, createdAt: row.createdAt })),
      hasInProgressOperation,
      hasOpenShopFloorTimer,
      now,
    };
    const executionState = deriveExecutionState(overlay);
    const progress = computeProgress(plannedQuantity, producedQuantity);
    const timerStart = currentOp ? openTimerDetails.get(currentOp.id)?.startedAt ?? null : null;
    const actualStart =
      resolveActualStart(overlay.productionStartedAt, overlay.history) ?? timerStart;
    const actualCompletion = resolveActualCompletion(overlay.productionCompletedAt, overlay.history);
    const durations = computeDurations({
      plannedStart: currentOp?.plannedStart ?? order.plannedStart,
      plannedEnd: currentOp?.plannedEnd ?? order.plannedEnd,
      actualStart,
      actualCompletion,
      now,
      executionState,
    });
    const risk = computeExecutionRisk({ ...overlay, executionState });
    const actions = allowedActions(executionState);
    const readiness = materials
      ? computeOrderMaterialReadiness(materials.materials, order.id, true)
      : null;
    const activeOperation = currentOp;
    const firstOperation = order.operations[0] ?? null;
    const requiresLineClearance = firstOperation?.routingOperation?.requiresLineClearance ?? false;
    const lineClearanceComplete = historyRows.some((row) => row.action === "PRODUCTION_LINE_CLEARANCE");

    const taskStartIso = activeOperation?.plannedStart?.toISOString() ?? order.plannedStart?.toISOString() ?? null;
    const taskStartDisplay =
      taskStartIso && new Date(taskStartIso).getTime() < now.getTime() && executionState !== "IN_PROGRESS"
        ? now.toISOString()
        : taskStartIso;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      productId: order.product.id,
      productName: order.product.name,
      productSku: order.product.sku,
      unit: order.product.unit ?? "unit",
      workstationId: activeOperation?.workstationId ?? order.workstationId,
      workstationName: activeOperation?.workstation?.name ?? order.workstation?.name ?? null,
      workstationActive: activeOperation?.workstation?.active ?? order.workstation?.active ?? null,
      priority: order.priority,
      planningStatus: order.status,
      executionState,
      plannedQuantity,
      producedQuantity,
      remainingQuantity: progress.remainingQuantity,
      progressPercent: progress.progressPercent,
      progressLabel: progress.progressLabel,
      plannedStart: taskStartDisplay,
      plannedEnd: order.plannedEnd?.toISOString() ?? null,
      dueDate: order.dueDate.toISOString(),
      orderKind: order.orderKind,
      actualStart: actualStart?.toISOString() ?? null,
      actualCompletion: actualCompletion?.toISOString() ?? null,
      plannedDurationMinutes: durations.plannedDurationMinutes,
      actualDurationMinutes: durations.actualDurationMinutes,
      durationVarianceMinutes: durations.durationVarianceMinutes,
      quantityVariance: progress.quantityVariance,
      risk: risk.risk,
      riskEvidence: risk.evidence,
      batchId: order.batch?.id ?? null,
      batchNumber: order.batch?.batchNumber ?? null,
      materialReadiness: readiness?.state ?? null,
      isReleased: history.some((row) => row.action === "PRODUCTION_RELEASE"),
      isPaused: executionState === "PAUSED",
      canRelease: canExecute && actions.canRelease,
      canStart:
        canExecute &&
        (actions.canStart || executionState === "WAITING") &&
        (!requiresLineClearance || lineClearanceComplete),
      canPause: canExecute && actions.canPause && !isQaHoldOperation(activeOperation?.operationCode),
      canQaRelease:
        (can(ctx.role, "quality.manage") || can(ctx.role, "batches.quality_action")) &&
        executionState === "IN_PROGRESS" &&
        isQaHoldOperation(activeOperation?.operationCode),
      canResume: canExecute && actions.canResume,
      canComplete: canExecute && actions.canComplete,
      requiresLineClearance,
      lineClearanceComplete,
      canSignLineClearance:
        canExecute &&
        requiresLineClearance &&
        !lineClearanceComplete &&
        (executionState === "RELEASED" || executionState === "WAITING"),
      history,
      activeOperationId: activeOperation?.id ?? null,
      activeOperationCode: activeOperation?.operationCode ?? null,
      activeOperationName: activeOperation
        ? routingStepDisplayName(activeOperation.operationCode, activeOperation.operationName)
        : null,
      activeOperationLabel: shopFloorStepLabel(activeOperation),
      shopFloorEvents: activeOperation
        ? shopFloorEventsByOperation.get(activeOperation.id) ?? []
        : [],
    };
  });

  return rows;
}

export async function getProductionExecutionSnapshot(
  ctx: TenantContext,
  filters: ProductionExecutionFilters,
  options?: { includeMaterials?: boolean }
): Promise<ProductionExecutionSnapshot> {
  requirePermission(ctx, "production.read");
  const { ensurePlannerScheduleFreshOnLoad } = await import("@/lib/server/planner-schedule-refresh");
  await ensurePlannerScheduleFreshOnLoad(ctx);
  const access = await resolvePlannerAccess(ctx);
  let allOrders = await loadExecutionOrders(ctx, options);
  if (access.scopedWorkstationIds?.length) {
    const allowed = new Set(access.scopedWorkstationIds);
    allOrders = allOrders.filter((row) => row.workstationId && allowed.has(row.workstationId));
  }
  const query = filters.query?.toLowerCase();
  const filtered = allOrders.filter((row) => {
    if (!matchesView(row, filters.view)) return false;
    if (filters.orderId && row.id !== filters.orderId) return false;
    if (filters.workstationId && row.workstationId !== filters.workstationId) return false;
    if (!query) return true;
    return (
      row.orderNumber.toLowerCase().includes(query) ||
      row.productName.toLowerCase().includes(query) ||
      row.productSku.toLowerCase().includes(query) ||
      (row.workstationName?.toLowerCase().includes(query) ?? false) ||
      (row.batchNumber?.toLowerCase().includes(query) ?? false)
    );
  });
  const workstations = [
    ...new Map(
      allOrders
        .filter((row) => row.workstationId && row.workstationName)
        .map((row) => [row.workstationId!, { id: row.workstationId!, name: row.workstationName!, code: row.workstationName! }])
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const queue = filtered
    .filter((row) => row.executionState === "RELEASED" || row.executionState === "WAITING")
    .sort((a, b) => {
      const rank = (row: ExecutionOrderRow) =>
        row.executionState === "IN_PROGRESS" ? 0 : row.executionState === "RELEASED" ? 1 : 2;
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      return (a.plannedStart ?? "").localeCompare(b.plannedStart ?? "");
    });
  const nextTask = queue[0] ?? null;

  const active = allOrders.filter((row) => row.executionState === "IN_PROGRESS").length;
  const paused = allOrders.filter((row) => row.executionState === "PAUSED").length;
  const waiting = allOrders.filter(
    (row) => row.executionState === "WAITING" || row.executionState === "RELEASED"
  ).length;
  const completed = allOrders.filter((row) => row.executionState === "COMPLETED").length;
  const orderPlannedEnd = new Map(allOrders.map((row) => [row.id, row.plannedEnd]));
  const atRisk = countDeliveryLateOrders(
    allOrders.map((row) => ({
      id: row.id,
      orderKind: row.orderKind,
      dueDate: row.dueDate,
      routing: {
        operations: [{ id: row.id, status: row.planningStatus, plannedStart: row.plannedStart, plannedEnd: row.plannedEnd }],
      },
    })),
    orderPlannedEnd,
    new Set<string>(),
    new Date()
  );

  const openWithDuration = allOrders.filter(
    (row) => row.plannedDurationMinutes != null && row.actualDurationMinutes != null
  );
  const plannedDurationSum = openWithDuration.reduce((sum, row) => sum + (row.plannedDurationMinutes ?? 0), 0);
  const actualDurationSum = openWithDuration.reduce((sum, row) => sum + (row.actualDurationMinutes ?? 0), 0);
  const completedWithQty = allOrders.filter(
    (row) => row.executionState === "COMPLETED" && row.producedQuantity != null
  );
  const plannedQtySum = completedWithQty.reduce((sum, row) => sum + row.plannedQuantity, 0);
  const actualQtySum = completedWithQty.reduce((sum, row) => sum + (row.producedQuantity ?? 0), 0);

  const prisma = getPrisma();
  const [actor, employees] = await Promise.all([
    ctx.userId
      ? prisma.user.findFirst({ where: { id: ctx.userId, tenantId: ctx.tenantId }, select: { id: true, name: true } })
      : Promise.resolve(null),
    prisma.plantEmployee.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 40,
    }),
  ]);

  return {
    asOf: new Date().toISOString(),
    view: filters.view,
    disclaimer:
      "Production execution is human-controlled. Release, start, pause, resume, and complete do not consume materials, create inventory lots, or send notifications.",
    kpis: [
      { id: "active", label: "Active", value: String(active), hint: "In progress", tone: "primary" },
      { id: "paused", label: "Paused", value: String(paused), hint: "Awaiting resume", tone: paused > 0 ? "warning" : "default" },
      { id: "waiting", label: "Waiting", value: String(waiting), hint: "Scheduled or released" },
      { id: "completed", label: "Completed", value: String(completed), hint: "Finished execution", tone: "success" },
      {
        id: "at-risk",
        label: "At risk",
        value: String(atRisk),
        hint: "Late, blocked, or attention",
        tone: atRisk > 0 ? "danger" : "default",
      },
    ],
    orders: filtered,
    attention: buildExecutionAttention(allOrders),
    workstations,
    workstationId: filters.workstationId ?? null,
    nextTask,
    shopFloorMode: Boolean(filters.workstationId),
    stationQueue: filters.workstationId
      ? sortStationQueue(
          filterOpenStationJobs(allOrders.filter((row) => row.workstationId === filters.workstationId))
        ).slice(0, 12)
      : [],
    performance: [
      {
        id: "duration",
        label: "Duration (planned vs logged history)",
        planned: openWithDuration.length > 0 ? plannedDurationSum : null,
        actual: openWithDuration.length > 0 ? actualDurationSum : null,
        unit: "minutes",
      },
      {
        id: "quantity",
        label: "Quantity (completed with produced qty)",
        planned: completedWithQty.length > 0 ? plannedQtySum : null,
        actual: completedWithQty.length > 0 ? actualQtySum : null,
        unit: "quantity",
      },
    ],
    capabilities: {
      canExecute: can(ctx.role, "production.execute"),
      canRead: can(ctx.role, "production.read"),
    },
    currentUser: { id: actor?.id ?? ctx.userId, name: actor?.name ?? null },
    operators: employees,
  };
}

async function loadOrderForMutation(ctx: TenantContext, orderId: string) {
  const prisma = getPrisma();
  const order = await prisma.productionOrder.findFirst({
    where: { id: orderId, tenantId: ctx.tenantId },
    include: {
      workstation: { select: { id: true, name: true, active: true, allowedParallelJobs: true } },
      batch: true,
      operations: {
        orderBy: { sequence: "asc" },
        include: { workstation: { select: { id: true, name: true, active: true, allowedParallelJobs: true } } },
      },
    },
  });
  if (!order) throw new ServerError("Production order not found.", "NOT_FOUND");
  return order;
}

async function currentMutationOperation(
  ctx: TenantContext,
  order: Awaited<ReturnType<typeof loadOrderForMutation>>
) {
  const openIds = await loadOpenShopFloorTimerOperationIds(ctx.tenantId);
  return resolveCurrentShopFloorOperation(order.operations, openIds);
}

/**
 * Offline replay guard. The Timer sends the operation the operator saw; if the server has moved on
 * (the same tap already landed), answer CONFLICT so the client drops the queued copy.
 */
function assertShopFloorReplay(current: { id: string } | null, options?: ShopFloorActionOptions) {
  if (options?.recordedAt === null) {
    throw new ServerError("This offline log is more than 24 hours old. Ask a supervisor to enter it manually.", "INTERNAL");
  }
  if (options?.expectedOperationId && current && current.id !== options.expectedOperationId) {
    throw new ServerError("This step was already logged. Refresh the station to see the current job.", "CONFLICT");
  }
}

async function assertWorkstationHasRunCapacity(
  ctx: TenantContext,
  workstationId: string | null,
  allowedParallel: number,
  exceptOrderId: string
) {
  if (!workstationId) return;
  const open = await loadOpenShopFloorTimers(ctx.tenantId);
  const runningOnWs = [...open.values()].filter((row) => row.isRunning);
  if (runningOnWs.length === 0) return;
  const prisma = getPrisma();
  const ops = await prisma.productionOperation.findMany({
    where: { tenantId: ctx.tenantId, id: { in: runningOnWs.map((row) => row.operationId) } },
    select: { id: true, workstationId: true, productionOrderId: true },
  });
  const others = ops.filter((op) => op.workstationId === workstationId && op.productionOrderId !== exceptOrderId);
  if (others.length >= Math.max(1, allowedParallel)) {
    throw new ServerError("Another job is already in progress on this workstation.", "FORBIDDEN");
  }
}

async function writeShopFloorEvent(
  ctx: TenantContext,
  operationId: string,
  eventType: "START" | "STOP" | "PAUSE" | "RESUME" | "SCRAP" | "DOWNTIME",
  input?: { quantity?: number; reason?: string; recordedAt?: Date | null }
) {
  await recordProductionOperationEvent(ctx, operationId, {
    eventType,
    quantity: input?.quantity,
    reason: input?.reason,
    recordedAt: input?.recordedAt ?? undefined,
  });
}

async function loadExecutionHistory(ctx: TenantContext, orderId: string) {
  return getPrisma().auditLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      entityType: "PRODUCTION_ORDER",
      entityId: orderId,
      action: { in: [...EXECUTION_AUDIT_ACTIONS] },
    },
    orderBy: { createdAt: "asc" },
  });
}

function currentStateFrom(order: { status: string }, history: Array<{ action: string; createdAt: Date }>) {
  return deriveExecutionState({
    planningStatus: order.status,
    plannedStart: null,
    plannedEnd: null,
    workstationId: null,
    workstationActive: null,
    plannedQuantity: 1,
    producedQuantity: null,
    productionStartedAt: null,
    productionCompletedAt: null,
    history,
  });
}

export async function releaseProductionOrder(ctx: TenantContext, orderId: string, reason?: string | null) {
  requirePermission(ctx, "production.execute");
  const order = await loadOrderForMutation(ctx, orderId);
  const history = await loadExecutionHistory(ctx, order.id);
  const state = currentStateFrom(order, history);

  if (state === "RELEASED" || state === "IN_PROGRESS" || state === "PAUSED" || state === "COMPLETED") {
    return { orderId: order.id, executionState: state, message: "Already released for execution.", idempotent: true };
  }
  if (order.status !== "SCHEDULED" && order.status !== "AT_RISK") {
    throw new ServerError("Only scheduled production orders can be released.", "INTERNAL");
  }
  if (!order.plannedStart || !order.plannedEnd) {
    throw new ServerError("Order must have planned start and end before release.", "INTERNAL");
  }

  await getPrisma().productionOrder.update({
    where: { id: order.id },
    data: { isLocked: true },
  });

  const change = formatStateChange("EXECUTION_STATE", state, "RELEASED");
  await writeAuditLog(ctx, {
    action: "PRODUCTION_RELEASE",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    oldValue: change.oldValue,
    newValue: change.newValue,
    reason: reason?.trim() || null,
  });

  return { orderId: order.id, executionState: "RELEASED" as const, message: "Production order released.", idempotent: false };
}

async function orderRequiresLineClearance(orderId: string, tenantId: string): Promise<boolean> {
  const first = await getPrisma().productionOperation.findFirst({
    where: { productionOrderId: orderId, tenantId },
    orderBy: { sequence: "asc" },
    include: { routingOperation: { select: { requiresLineClearance: true } } },
  });
  return first?.routingOperation?.requiresLineClearance ?? false;
}

export async function signProductionLineClearance(
  ctx: TenantContext,
  orderId: string,
  input?: { signatureLabel?: string | null }
) {
  requirePermission(ctx, "production.execute");
  const order = await loadOrderForMutation(ctx, orderId);
  const history = await loadExecutionHistory(ctx, order.id);
  const state = currentStateFrom(order, history);
  const requires = await orderRequiresLineClearance(order.id, ctx.tenantId);
  if (!requires) {
    throw new ServerError("This order does not require line clearance.", "INTERNAL");
  }
  if (history.some((row) => row.action === "PRODUCTION_LINE_CLEARANCE")) {
    return { orderId: order.id, message: "Line clearance already recorded.", idempotent: true };
  }
  if (state !== "RELEASED" && state !== "WAITING") {
    throw new ServerError("Release the order before signing line clearance.", "INTERNAL");
  }
  const label = input?.signatureLabel?.trim() || ctx.userId;
  await writeAuditLog(ctx, {
    action: "PRODUCTION_LINE_CLEARANCE",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    newValue: `Signed by ${label}`,
  });
  return { orderId: order.id, message: "Line clearance recorded.", idempotent: false };
}

export async function startProductionOrder(
  ctx: TenantContext,
  orderId: string,
  reason?: string | null,
  options?: ShopFloorActionOptions
) {
  requirePermission(ctx, "production.execute");
  const order = await loadOrderForMutation(ctx, orderId);
  const history = await loadExecutionHistory(ctx, order.id);
  const state = currentStateFrom(order, history);

  if (state === "IN_PROGRESS") {
    return { orderId: order.id, executionState: state, message: "Already in progress.", idempotent: true };
  }
  if (state === "COMPLETED") {
    throw new ServerError("Completed orders cannot be started.", "INTERNAL");
  }
  if (state === "PAUSED") {
    throw new ServerError("Paused orders must be resumed, not started again.", "INTERNAL");
  }
  if (state === "WAITING") {
    if (order.status !== "SCHEDULED" && order.status !== "AT_RISK") {
      throw new ServerError("Release the order before starting execution.", "INTERNAL");
    }
    await writeAuditLog(ctx, {
      action: "PRODUCTION_RELEASE",
      entityType: "PRODUCTION_ORDER",
      entityId: order.id,
      newValue: "RELEASED",
      reason: reason?.trim() || "Shop-floor start",
    });
  } else if (state !== "RELEASED") {
    throw new ServerError("Release the order before starting execution.", "INTERNAL");
  }
  if (!order.workstationId) {
    throw new ServerError("Assign a workstation before starting.", "INTERNAL");
  }
  if (order.workstation && !order.workstation.active) {
    throw new ServerError("Workstation is inactive.", "FORBIDDEN");
  }
  if (await orderRequiresLineClearance(order.id, ctx.tenantId)) {
    if (!history.some((row) => row.action === "PRODUCTION_LINE_CLEARANCE")) {
      throw new ServerError("Complete line clearance before starting this batch.", "FORBIDDEN");
    }
  }
  const prisma = getPrisma();
  const current = await currentMutationOperation(ctx, order);
  assertShopFloorReplay(current, options);
  const workstationId = current?.workstationId ?? order.workstationId;
  const allowedParallel = current?.workstation?.allowedParallelJobs ?? order.workstation?.allowedParallelJobs ?? 1;
  await assertWorkstationHasRunCapacity(ctx, workstationId, allowedParallel, order.id);

  const now = options?.recordedAt ?? new Date();
  await prisma.productionOrder.update({
    where: { id: order.id },
    data: { status: "IN_PROGRESS", isLocked: true, workstationId: workstationId ?? order.workstationId },
  });
  if (current) {
    await prisma.productionOperation.update({
      where: { id: current.id },
      data: {
        status: "IN_PROGRESS",
        actualStart: current.actualStart ?? now,
        plannedStart: current.plannedStart ?? now,
        plannedEnd:
          current.plannedEnd && current.plannedEnd.getTime() > now.getTime()
            ? current.plannedEnd
            : new Date(now.getTime() + Math.max(30, current.durationMinutes) * 60_000),
      },
    });
    await writeShopFloorEvent(ctx, current.id, "START", { reason: reason?.trim() || undefined, recordedAt: options?.recordedAt });
  }
  if (order.batch && !order.batch.productionStartedAt) {
    await prisma.productionBatch.update({
      where: { id: order.batch.id },
      data: { productionStartedAt: now },
    });
  }

  const change = formatStateChange("EXECUTION_STATE", state, "IN_PROGRESS");
  await writeAuditLog(ctx, {
    action: "PRODUCTION_START",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    oldValue: change.oldValue,
    newValue: change.newValue,
    reason: reason?.trim() || null,
  });

  const { emitPlannerWebhook } = await import("@/lib/server/planner-webhooks");
  await emitPlannerWebhook(ctx, "PRODUCTION_JOB_STARTED", {
    orderId: order.id,
    orderNumber: order.orderNumber,
  }).catch(() => undefined);

  return { orderId: order.id, executionState: "IN_PROGRESS" as const, message: "Production started.", idempotent: false };
}

export async function pauseProductionOrder(
  ctx: TenantContext,
  orderId: string,
  reason?: string | null,
  options?: ShopFloorActionOptions
) {
  requirePermission(ctx, "production.execute");
  const order = await loadOrderForMutation(ctx, orderId);
  const history = await loadExecutionHistory(ctx, order.id);
  const state = currentStateFrom(order, history);

  if (state === "PAUSED") {
    return { orderId: order.id, executionState: state, message: "Already paused.", idempotent: true };
  }
  if (state !== "IN_PROGRESS") {
    throw new ServerError("Only in-progress orders can be paused.", "INTERNAL");
  }

  const current = await currentMutationOperation(ctx, order);
  assertShopFloorReplay(current, options);
  // Execution page / station queue send the bare code as `reason`; the Timer sends reasonCode + note.
  const bareCode = options?.reasonCode ? null : parsePauseReasonCode(reason);
  const code = options?.reasonCode ?? bareCode;
  const pauseReason = formatPauseReason(code, bareCode ? null : reason);
  if (current) {
    await writeShopFloorEvent(ctx, current.id, "PAUSE", { reason: pauseReason, recordedAt: options?.recordedAt });
    if (isDowntimePause(code)) {
      // Unplanned stop: also log DOWNTIME so the shop-floor replan rules (autopilot policy) can react.
      await writeShopFloorEvent(ctx, current.id, "DOWNTIME", {
        reason: pauseReason ?? PAUSE_REASON_LABELS[code!],
        recordedAt: options?.recordedAt,
      });
    }
  }

  const change = formatStateChange("EXECUTION_STATE", state, "PAUSED");
  await writeAuditLog(ctx, {
    action: "PRODUCTION_PAUSE",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    oldValue: change.oldValue,
    newValue: change.newValue,
    reason: pauseReason ?? null,
  });

  return { orderId: order.id, executionState: "PAUSED" as const, message: "Production paused.", idempotent: false };
}

export async function resumeProductionOrder(
  ctx: TenantContext,
  orderId: string,
  reason?: string | null,
  options?: ShopFloorActionOptions
) {
  requirePermission(ctx, "production.execute");
  const order = await loadOrderForMutation(ctx, orderId);
  const history = await loadExecutionHistory(ctx, order.id);
  const state = currentStateFrom(order, history);

  if (state === "IN_PROGRESS") {
    return { orderId: order.id, executionState: state, message: "Already in progress.", idempotent: true };
  }
  if (state !== "PAUSED") {
    throw new ServerError("Only paused orders can be resumed.", "INTERNAL");
  }

  const current = await currentMutationOperation(ctx, order);
  assertShopFloorReplay(current, options);
  if (current) {
    await writeShopFloorEvent(ctx, current.id, "RESUME", { reason: reason?.trim() || undefined, recordedAt: options?.recordedAt });
  }

  const change = formatStateChange("EXECUTION_STATE", state, "IN_PROGRESS");
  await writeAuditLog(ctx, {
    action: "PRODUCTION_RESUME",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    oldValue: change.oldValue,
    newValue: change.newValue,
    reason: reason?.trim() || null,
  });

  return { orderId: order.id, executionState: "IN_PROGRESS" as const, message: "Production resumed.", idempotent: false };
}

export async function completeProductionOrder(
  ctx: TenantContext,
  orderId: string,
  input?: { producedQuantity?: number | null; scrapQuantity?: number | null; reason?: string | null }
) {
  requirePermission(ctx, "production.execute");
  const order = await loadOrderForMutation(ctx, orderId);
  const history = await loadExecutionHistory(ctx, order.id);
  const state = currentStateFrom(order, history);

  if (state === "COMPLETED") {
    return { orderId: order.id, executionState: state, message: "Already completed.", idempotent: true };
  }
  if (state !== "IN_PROGRESS" && state !== "PAUSED") {
    throw new ServerError("Start production before completing.", "INTERNAL");
  }

  const plannedQuantity = order.batch?.plannedQuantity ?? order.quantity;
  const requireQuantity = Boolean(order.batch);
  const validation = validateProducedQuantity(input?.producedQuantity, plannedQuantity, requireQuantity);
  if (validation) throw new ServerError(validation, "INTERNAL");

  const now = new Date();
  const prisma = getPrisma();
  const current = await currentMutationOperation(ctx, order);
  if (current) {
    if (input?.scrapQuantity && input.scrapQuantity > 0) {
      await writeShopFloorEvent(ctx, current.id, "SCRAP", {
        quantity: input.scrapQuantity,
        reason: input?.reason?.trim() || "Scrap",
      });
    }
    await writeShopFloorEvent(ctx, current.id, "STOP", {
      quantity: input?.producedQuantity ?? undefined,
      reason: input?.reason?.trim() || undefined,
    });
    await prisma.productionOperation.update({
      where: { id: current.id },
      data: { status: "COMPLETED", actualEnd: now, isLocked: true },
    });
  }
  await prisma.productionOrder.update({
    where: { id: order.id },
    data: { status: "COMPLETED", isLocked: true },
  });

  if (order.batch) {
    await prisma.productionBatch.update({
      where: { id: order.batch.id },
      data: {
        producedQuantity: input?.producedQuantity ?? order.batch.producedQuantity,
        productionCompletedAt: now,
        productionStartedAt: order.batch.productionStartedAt ?? now,
      },
    });
  }

  const change = formatStateChange("EXECUTION_STATE", state, "COMPLETED");
  await writeAuditLog(ctx, {
    action: "PRODUCTION_COMPLETE",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    oldValue: change.oldValue,
    newValue: `${change.newValue}${input?.producedQuantity != null ? ` · QTY: ${input.producedQuantity}` : ""}`,
    reason: input?.reason?.trim() || null,
  });

  const { emitPlannerWebhook } = await import("@/lib/server/planner-webhooks");
  await emitPlannerWebhook(ctx, "PRODUCTION_JOB_COMPLETED", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    producedQuantity: input?.producedQuantity ?? order.batch?.producedQuantity ?? null,
  }).catch(() => undefined);

  return { orderId: order.id, executionState: "COMPLETED" as const, message: "Production completed.", idempotent: false };
}

export async function stopShopFloorOperation(
  ctx: TenantContext,
  orderId: string,
  input?: { producedQuantity?: number | null; scrapQuantity?: number | null; reason?: string | null } & ShopFloorActionOptions
) {
  requirePermission(ctx, "production.execute");
  const order = await loadOrderForMutation(ctx, orderId);
  const history = await loadExecutionHistory(ctx, order.id);
  const state = currentStateFrom(order, history);
  if (state === "COMPLETED" && input?.expectedOperationId) {
    throw new ServerError("This order is already complete.", "CONFLICT");
  }
  if (state !== "IN_PROGRESS" && state !== "PAUSED") {
    throw new ServerError("Start production before stopping.", "INTERNAL");
  }
  const current = await currentMutationOperation(ctx, order);
  if (!current) throw new ServerError("No running operation to stop.", "INTERNAL");
  assertShopFloorReplay(current, input);

  const plannedQuantity = order.batch?.plannedQuantity ?? order.quantity;
  if (order.batch) {
    const validation = validateProducedQuantity(input?.producedQuantity, plannedQuantity, true);
    if (validation) throw new ServerError(validation, "INTERNAL");
  }

  const now = input?.recordedAt ?? new Date();
  const prisma = getPrisma();
  if (input?.scrapQuantity && input.scrapQuantity > 0) {
    await writeShopFloorEvent(ctx, current.id, "SCRAP", {
      quantity: input.scrapQuantity,
      reason: input?.reason?.trim() || "Scrap",
      recordedAt: input?.recordedAt,
    });
  }
  await writeShopFloorEvent(ctx, current.id, "STOP", {
    quantity: input?.producedQuantity ?? undefined,
    reason: input?.reason?.trim() || undefined,
    recordedAt: input?.recordedAt,
  });
  await prisma.productionOperation.update({
    where: { id: current.id },
    data: { status: "COMPLETED", actualEnd: now, isLocked: true },
  });

  const remaining = order.operations.filter((op) => op.id !== current.id && op.status !== "COMPLETED");
  if (remaining.length === 0) {
    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { status: "COMPLETED", isLocked: true },
    });
    if (order.batch) {
      await prisma.productionBatch.update({
        where: { id: order.batch.id },
        data: {
          producedQuantity: input?.producedQuantity ?? order.batch.producedQuantity,
          productionCompletedAt: now,
          productionStartedAt: order.batch.productionStartedAt ?? now,
        },
      });
    }
    await writeAuditLog(ctx, {
      action: "PRODUCTION_COMPLETE",
      entityType: "PRODUCTION_ORDER",
      entityId: order.id,
      newValue: "COMPLETED",
      reason: input?.reason?.trim() || null,
    });
    return {
      orderId: order.id,
      operationId: current.id,
      executionState: "COMPLETED" as const,
      message: "Production completed.",
      idempotent: false,
    };
  }

  await writeAuditLog(ctx, {
    action: "PRODUCTION_COMPLETE",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    newValue: `${current.operationCode} stopped`,
    reason: input?.reason?.trim() || null,
  });
  return {
    orderId: order.id,
    operationId: current.id,
    executionState: "IN_PROGRESS" as const,
    message: "Operation stopped. Next step is in the station queue.",
    idempotent: false,
  };
}

export async function qaReleaseProductionOperation(
  ctx: TenantContext,
  orderId: string,
  input: { signature: string }
) {
  if (!can(ctx.role, "quality.manage") && !can(ctx.role, "batches.quality_action")) {
    throw new ServerError("QA release requires a quality role.", "FORBIDDEN");
  }
  const signature = input.signature.trim();
  if (signature.length < 3) {
    throw new ServerError("Type your name to e-sign this QA release.", "INTERNAL");
  }
  const order = await loadOrderForMutation(ctx, orderId);
  const prisma = getPrisma();
  const active = await currentMutationOperation(ctx, order);
  if (!active || !isQaHoldOperation(active.operationCode)) {
    throw new ServerError("No quarantine or QC step is in progress on this order.", "INTERNAL");
  }

  const now = new Date();
  await prisma.productionOperation.update({
    where: { id: active.id },
    data: { status: "COMPLETED", actualEnd: now, isLocked: true },
  });
  await prisma.productionOperationEvent.create({
    data: {
      tenantId: ctx.tenantId,
      productionOperationId: active.id,
      eventType: "STOP",
      recordedAt: now,
      recordedById: ctx.userId,
      reason: `QA release · signed ${signature}`,
    },
  });
  await writeAuditLog(ctx, {
    action: "PRODUCTION_QA_RELEASE",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    newValue: `${active.operationCode} released`,
    reason: `E-signed by ${signature}`,
  });
  return {
    orderId: order.id,
    operationId: active.id,
    message: "QA released. The next step can start.",
  };
}

/** Compact signals for Command Center / Reports — lightweight, no materials. */
export async function getProductionExecutionSignals(ctx: TenantContext) {
  try {
    const prisma = getPrisma();
    const orders = await prisma.productionOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["SCHEDULED", "AT_RISK", "IN_PROGRESS", "COMPLETED"] },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        plannedStart: true,
        plannedEnd: true,
        workstationId: true,
        quantity: true,
        batch: {
          select: {
            producedQuantity: true,
            productionStartedAt: true,
            productionCompletedAt: true,
            plannedQuantity: true,
          },
        },
        workstation: { select: { active: true } },
      },
    });
    const orderIds = orders.map((row) => row.id);
    const audits =
      orderIds.length === 0
        ? []
        : await prisma.auditLog.findMany({
            where: {
              tenantId: ctx.tenantId,
              entityType: "PRODUCTION_ORDER",
              entityId: { in: orderIds },
              action: { in: [...EXECUTION_AUDIT_ACTIONS] },
            },
            select: { entityId: true, action: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          });
    const byOrder = new Map<string, Array<{ action: string; createdAt: Date }>>();
    for (const audit of audits) {
      if (!audit.entityId) continue;
      const list = byOrder.get(audit.entityId) ?? [];
      list.push({ action: audit.action, createdAt: audit.createdAt });
      byOrder.set(audit.entityId, list);
    }

    const now = new Date();
    let active = 0;
    let paused = 0;
    let atRisk = 0;
    let late = 0;

    for (const order of orders) {
      const history = byOrder.get(order.id) ?? [];
      const plannedQuantity = order.batch?.plannedQuantity ?? order.quantity;
      const state = deriveExecutionState({
        planningStatus: order.status,
        plannedStart: order.plannedStart,
        plannedEnd: order.plannedEnd,
        workstationId: order.workstationId,
        workstationActive: order.workstation?.active ?? null,
        plannedQuantity,
        producedQuantity: order.batch?.producedQuantity ?? null,
        productionStartedAt: order.batch?.productionStartedAt ?? null,
        productionCompletedAt: order.batch?.productionCompletedAt ?? null,
        history,
        now,
      });
      if (state === "IN_PROGRESS") active += 1;
      if (state === "PAUSED") paused += 1;
      const risk = computeExecutionRisk({
        planningStatus: order.status,
        plannedStart: order.plannedStart,
        plannedEnd: order.plannedEnd,
        workstationId: order.workstationId,
        workstationActive: order.workstation?.active ?? null,
        plannedQuantity,
        producedQuantity: order.batch?.producedQuantity ?? null,
        productionStartedAt: order.batch?.productionStartedAt ?? null,
        productionCompletedAt: order.batch?.productionCompletedAt ?? null,
        history,
        executionState: state,
        now,
      });
      if (risk.risk === "AT_RISK" || risk.risk === "LATE" || risk.risk === "BLOCKED") atRisk += 1;
      if (risk.risk === "LATE") late += 1;
    }

    return { active, paused, atRisk, late, attention: [] as Array<{ id: string }> };
  } catch {
    return null;
  }
}
