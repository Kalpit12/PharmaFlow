import {
  capacityStateFromLoad,
  scheduledOperationMinutesInWindow,
  utilizationForWorkstation,
} from "@/lib/operations/gantt-capacity";
import { availableWorkingMinutes, createStandardWorkCalendar } from "@/lib/operations/calendar";
import {
  jobStatusIsLate,
  jobStatusIsRunning,
  resolveJobPlanStatus,
  type JobPlanStatus,
} from "@/lib/operations/plan-job-status";
import {
  operationProposalMoved,
  summarizeLockBreakdown,
  type LockBreakdown,
  type OperationMoveSnapshot,
} from "@/lib/operations/plan-proposal-metrics";
import { buildOrderMaterialConstraints } from "@/lib/operations/material-constraints";
import { freezeUntilFromPolicy, getActiveProposal, getOrCreatePlanningPolicy, loadWorkstationCalendars } from "@/lib/server/aps-plan";
import { requirePermission } from "@/lib/auth/authorization";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";

export type PlanSnapshotWindow = {
  start: Date;
  end: Date;
};

export type PlanWorkstationLoad = {
  id: string;
  code: string;
  name: string;
  utilization: number | null;
  scheduledHours: number;
  availableHours: number;
  capacityState: "OK" | "WARNING" | "DANGER" | "N/A";
};

export type PlanSnapshotJob = {
  operationId: string;
  orderId: string;
  orderNumber: string;
  workstationId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  dueDate: string;
  changeoverMinutes: number;
  status: JobPlanStatus;
};

export type PlanSnapshotProposalMetrics = {
  planId: string;
  jobsMoved: number;
  movedOrders: number;
  lockedOrders: number;
  blockedOrders: number;
  lateOrders: number;
  totalChangeoverMinutes: number;
  lockBreakdown: LockBreakdown;
  operationMoves: OperationMoveSnapshot[];
};

export type PlanSnapshot = {
  generatedAt: string;
  window: { start: string; end: string };
  jobs: PlanSnapshotJob[];
  workstationLoads: PlanWorkstationLoad[];
  avgCapacityPercent: number;
  jobsRunning: number;
  jobsLate: number;
  ordersAtRisk: number;
  materialBlockedOrders: number;
  changeoverMinutesInWindow: number;
  activeTimerOperationIds: string[];
  proposal: PlanSnapshotProposalMetrics | null;
};

async function loadActiveTimerOperationIds(tenantId: string): Promise<Set<string>> {
  const prisma = getPrisma();
  const since = new Date(Date.now() - 90 * 86_400_000);
  const events = await prisma.productionOperationEvent.findMany({
    where: { tenantId, recordedAt: { gte: since } },
    orderBy: { recordedAt: "desc" },
    select: { productionOperationId: true, eventType: true },
  });
  const seen = new Set<string>();
  const open = new Set<string>();
  for (const row of events) {
    if (seen.has(row.productionOperationId)) continue;
    seen.add(row.productionOperationId);
    if (row.eventType === "START") open.add(row.productionOperationId);
  }
  return open;
}

function orderPlannedEndByOrderId(
  ops: Array<{ productionOrderId: string; plannedEnd: Date | null }>
): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const op of ops) {
    if (!op.plannedEnd) continue;
    const prev = map.get(op.productionOrderId);
    if (!prev || op.plannedEnd.getTime() > prev.getTime()) {
      map.set(op.productionOrderId, op.plannedEnd);
    }
  }
  return map;
}

export async function getPlanSnapshot(
  ctx: TenantContext,
  window: PlanSnapshotWindow,
  options?: { planId?: string | null }
): Promise<PlanSnapshot> {
  requirePermission(ctx, "production.read");
  const prisma = getPrisma();
  const now = new Date();
  const [materials, policy, activeTimers, wsRows] = await Promise.all([
    getMaterialsSnapshot(ctx, resolveMaterialsFilters({})).catch(() => null),
    getOrCreatePlanningPolicy(ctx),
    loadActiveTimerOperationIds(ctx.tenantId),
    prisma.workstation.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const calendars = await loadWorkstationCalendars(
    ctx.tenantId,
    wsRows.map((row) => ({ id: row.id, code: row.code, capacityHoursPerDay: row.capacityHoursPerDay }))
  );

  const dbOperations = await prisma.productionOperation.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      productionOrder: {
        select: {
          id: true,
          orderNumber: true,
          orderKind: true,
          dueDate: true,
          isLocked: true,
          status: true,
        },
      },
      routingOperation: { select: { isQcHold: true } },
    },
    orderBy: [{ productionOrderId: "asc" }, { sequence: "asc" }],
  });

  const orderEndById = orderPlannedEndByOrderId(dbOperations);

  const materialConstraints = materials?.materials.length
    ? buildOrderMaterialConstraints(
        materials.materials,
        [...new Set(dbOperations.map((row) => row.productionOrderId))],
        now
      )
    : new Map<string, { state: string }>();

  const jobs: PlanSnapshotJob[] = dbOperations.map((op) => {
    const order = op.productionOrder;
    const orderEnd = orderEndById.get(order.id);
    const status = resolveJobPlanStatus({
      operationStatus: op.status,
      orderKind: order.orderKind as "FIRM" | "PROSPECT",
      plannedStart: op.plannedStart?.toISOString() ?? null,
      plannedEnd: op.plannedEnd?.toISOString() ?? null,
      dueDate: order.dueDate.toISOString(),
      isQcHold: op.routingOperation?.isQcHold ?? false,
      hasActiveTimer: activeTimers.has(op.id),
      orderPlannedEnd: orderEnd?.toISOString() ?? null,
      now,
    });
    return {
      operationId: op.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      workstationId: op.workstationId,
      plannedStart: op.plannedStart?.toISOString() ?? null,
      plannedEnd: op.plannedEnd?.toISOString() ?? null,
      dueDate: order.dueDate.toISOString(),
      changeoverMinutes: op.setupMinutes ?? 0,
      status,
    };
  });

  const loadOps = dbOperations
    .filter((op) => op.plannedStart && op.plannedEnd && op.workstationId)
    .map((op) => ({
      workstationId: op.workstationId,
      plannedStart: op.plannedStart,
      plannedEnd: op.plannedEnd,
      changeoverMinutes: op.setupMinutes ?? 0,
    }));

  const workstationLoads: PlanWorkstationLoad[] = wsRows.map((row) => {
    const calendar = calendars.get(row.id) ?? createStandardWorkCalendar(row.capacityHoursPerDay);
    const elapsedOnly = row.code === "QC-HOLD";
    const scheduledMinutes = scheduledOperationMinutesInWindow(
      loadOps,
      row.id,
      window.start,
      window.end
    );
    const availableMinutes = elapsedOnly
      ? 0
      : availableWorkingMinutes(window.start, window.end, calendar);
    const utilization = elapsedOnly
      ? null
      : utilizationForWorkstation(scheduledMinutes, calendar, window.start, window.end);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      utilization,
      scheduledHours: Math.round((scheduledMinutes / 60) * 10) / 10,
      availableHours: elapsedOnly ? 0 : Math.round((availableMinutes / 60) * 10) / 10,
      capacityState: elapsedOnly ? "N/A" : capacityStateFromLoad(utilization ?? 0),
    };
  });

  const utilRows = workstationLoads.filter((row) => row.utilization != null);
  const avgCapacityPercent =
    utilRows.length === 0
      ? 0
      : Math.round(utilRows.reduce((sum, row) => sum + (row.utilization ?? 0), 0) / utilRows.length);

  const jobsRunning = jobs.filter((row) => jobStatusIsRunning(row.status)).length;
  const jobsLate = jobs.filter((row) => jobStatusIsLate(row.status)).length;
  const ordersAtRiskFromDue = new Set(jobs.filter((row) => row.status === "AT_RISK").map((row) => row.orderId));
  const ordersWithUnscheduledSteps = new Set(
    jobs.filter((row) => row.status === "UNSCHEDULED").map((row) => row.orderId)
  );
  const ordersAtRisk = new Set([...ordersAtRiskFromDue, ...ordersWithUnscheduledSteps]).size;
  const materialBlockedOrders = new Set(
    [...materialConstraints.entries()]
      .filter(([, constraint]) => constraint.state === "BLOCKED")
      .map(([orderId]) => orderId)
  ).size;

  const changeoverMinutesInWindow = loadOps.reduce((sum, op) => {
    if (!op.plannedStart || !op.plannedEnd) return sum;
    const start = Math.max(op.plannedStart.getTime(), window.start.getTime());
    const end = Math.min(op.plannedEnd.getTime(), window.end.getTime());
    if (end <= start) return sum;
    return sum + (op.changeoverMinutes ?? 0);
  }, 0);

  let proposal: PlanSnapshotProposalMetrics | null = null;
  const planId = options?.planId ?? (await getActiveProposal(ctx))?.id ?? null;
  if (planId) {
    const [planOps, planOrders] = await Promise.all([
      prisma.schedulePlanOperation.findMany({
        where: { tenantId: ctx.tenantId, planId },
        include: {
          productionOperation: {
            select: {
              id: true,
              plannedStart: true,
              plannedEnd: true,
              workstationId: true,
              productionOrderId: true,
              productionOrder: { select: { orderNumber: true, isLocked: true } },
            },
          },
        },
      }),
      prisma.schedulePlanOrder.findMany({
        where: { tenantId: ctx.tenantId, planId },
        include: {
          productionOrder: { select: { orderNumber: true, isLocked: true, dueDate: true } },
        },
      }),
    ]);

    const operationMoves: OperationMoveSnapshot[] = planOps.map((row) => {
      const prev = row.productionOperation;
      const moved = operationProposalMoved({
        previousStart: prev.plannedStart,
        previousEnd: prev.plannedEnd,
        previousWorkstationId: prev.workstationId,
        proposedStart: row.proposedStart,
        proposedEnd: row.proposedEnd,
        proposedWorkstationId: row.workstationId,
      });
      return {
        productionOperationId: prev.id,
        orderNumber: prev.productionOrder.orderNumber,
        previousStart: prev.plannedStart?.toISOString() ?? null,
        previousEnd: prev.plannedEnd?.toISOString() ?? null,
        previousWorkstationId: prev.workstationId,
        proposedStart: row.proposedStart?.toISOString() ?? null,
        proposedEnd: row.proposedEnd?.toISOString() ?? null,
        proposedWorkstationId: row.workstationId,
        changeoverMinutes: row.changeoverMinutes,
        moved,
      };
    });

    const freezeUntil = freezeUntilFromPolicy(policy.freezeMinutes, window.start);
    const lockBreakdown = summarizeLockBreakdown({
      orders: [
        ...new Map(
          dbOperations.map((op) => [
            op.productionOrderId,
            { id: op.productionOrderId, isLocked: op.productionOrder.isLocked },
          ])
        ).values(),
      ],
      operations: dbOperations.map((op) => ({
        productionOrderId: op.productionOrderId,
        isLocked: op.isLocked,
        status: op.status,
        plannedStart: op.plannedStart,
      })),
      freezeUntil,
    });

    const blockedOrders = planOrders.filter(
      (row) => materialConstraints.get(row.productionOrderId)?.state === "BLOCKED"
    ).length;
    const lateOrders = planOrders.filter((row) => {
      if (!row.proposedEnd) return false;
      return row.proposedEnd.getTime() > row.productionOrder.dueDate.getTime();
    }).length;
    const lockedOrders = planOrders.filter((row) => row.productionOrder.isLocked).length;
    const jobsMoved = operationMoves.filter((row) => row.moved).length;
    const movedOrders = planOrders.filter((row) => row.changeMinutes !== 0).length;
    const totalChangeoverMinutes = planOps.reduce((sum, row) => sum + row.changeoverMinutes, 0);

    proposal = {
      planId,
      jobsMoved,
      movedOrders,
      lockedOrders: lockBreakdown.ordersWithCommittedOps,
      blockedOrders,
      lateOrders,
      totalChangeoverMinutes,
      lockBreakdown,
      operationMoves,
    };
  }

  return {
    generatedAt: now.toISOString(),
    window: { start: window.start.toISOString(), end: window.end.toISOString() },
    jobs,
    workstationLoads,
    avgCapacityPercent,
    jobsRunning,
    jobsLate,
    ordersAtRisk,
    materialBlockedOrders,
    changeoverMinutesInWindow,
    activeTimerOperationIds: [...activeTimers],
    proposal,
  };
}
