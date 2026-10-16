import {
  buildDailyCapacityLoad,
  computeOtif,
  computeOeeProxy,
  pickBottleneckWorkstation,
  workstationUtilizationRows,
  type ScheduledOperationSlice,
} from "@/lib/operations/planner-dashboard-metrics";
import type { ChartBarRow } from "@/lib/charts/types";
import { requirePermission } from "@/lib/auth/authorization";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { getOperationsPlanner, resolvePlanningWindow } from "@/lib/server/operations";
import { getPlanSnapshot } from "@/lib/server/plan-snapshot";

export type PlannerJobReportRow = {
  id: string;
  orderNumber: string;
  productName: string;
  workstationName: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  dueDate: string;
  status: string;
  quantity: number;
  producedQuantity: number | null;
};

export type PlannerOrderItemRow = {
  id: string;
  orderNumber: string;
  productSku: string;
  productName: string;
  quantity: number;
  dueDate: string;
  status: string;
  workstationName: string | null;
};

export type PlannerTimelogRow = {
  id: string;
  recordedAt: string;
  eventType: string;
  orderNumber: string;
  operationCode: string;
  workstationName: string | null;
  quantity: number | null;
  reason: string | null;
  actorName: string | null;
};

export type OperationsDashboardSnapshot = {
  generatedAt: string;
  window: { start: string; end: string };
  kpis: Array<{ id: string; label: string; value: string; hint: string }>;
  dailyLoad: ChartBarRow[];
  workstationLoad: ChartBarRow[];
  bottleneck: { code: string; name: string; utilization: number } | null;
  jobReport: PlannerJobReportRow[];
  timelogs: PlannerTimelogRow[];
  orderItems: PlannerOrderItemRow[];
  oeeByWorkstation: Array<{
    workstationId: string;
    code: string;
    name: string;
    oeePercent: number;
    availabilityPercent: number;
    performancePercent: number;
    qualityPercent: number;
  }>;
  hasTimelogData: boolean;
};

const TIMELOG_HORIZON_DAYS = 30;

function resolveDashboardWindow(options?: { from?: Date | null; to?: Date | null }) {
  if (options?.from && options?.to && !Number.isNaN(options.from.getTime()) && !Number.isNaN(options.to.getTime())) {
    return { start: options.from, end: options.to };
  }
  const window = resolvePlanningWindow({ weeks: "2" });
  return { start: window.start, end: window.end };
}

function inScope(workstationId: string | null, scopedWorkstationIds: string[] | null | undefined): boolean {
  if (!scopedWorkstationIds || scopedWorkstationIds.length === 0) return true;
  if (!workstationId) return false;
  return scopedWorkstationIds.includes(workstationId);
}

export async function getOperationsDashboardSnapshot(
  ctx: TenantContext,
  options?: { from?: Date | null; to?: Date | null; scopedWorkstationIds?: string[] | null }
): Promise<OperationsDashboardSnapshot> {
  requirePermission(ctx, "production.read");
  const window = resolveDashboardWindow(options);
  const plannerWindow = resolvePlanningWindow({
    weeks: "2",
    start: window.start.toISOString().slice(0, 10),
  });
  const [planner, planSnapshot] = await Promise.all([
    getOperationsPlanner(ctx, plannerWindow),
    getPlanSnapshot(ctx, { start: window.start, end: window.end }),
  ]);
  const prisma = getPrisma();
  const now = new Date();
  const scope = options?.scopedWorkstationIds;

  const workstationCapacity = planner.workstations
    .filter((row) => inScope(row.id, scope))
    .map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    capacityHoursPerDay: row.capacityHoursPerDay,
    utilization: row.utilization,
  }));

  const operationSlices: ScheduledOperationSlice[] = [];
  const productSkuById = new Map(planner.products.map((row) => [row.id, row.sku]));

  for (const order of planner.orders) {
    for (const operation of order.routing.operations) {
      if (!operation.plannedStart || !operation.plannedEnd) continue;
      if (!inScope(operation.workstationId, scope)) continue;
      operationSlices.push({
        workstationId: operation.workstationId,
        plannedStart: operation.plannedStart,
        plannedEnd: operation.plannedEnd,
        changeoverMinutes: operation.changeoverMinutes,
      });
    }
  }

  const dailyLoad = buildDailyCapacityLoad({
    operations: operationSlices,
    workstations: workstationCapacity,
    horizonDays: 14,
    anchor: window.start,
  });
  const workstationLoad = workstationUtilizationRows(workstationCapacity);
  const bottleneck = pickBottleneckWorkstation(workstationCapacity);

  const orderRows = await prisma.productionOrder.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      product: { select: { name: true } },
      workstation: { select: { name: true } },
      batch: { select: { producedQuantity: true, productionCompletedAt: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 120,
  });

  const otif = computeOtif(
    orderRows.map((row) => ({
      dueDate: row.dueDate,
      actualCompletion: row.batch?.productionCompletedAt ?? null,
      status: row.status,
    }))
  );

  const scopedOrders = planner.orders.filter(
    (row) => inScope(row.workstationId, scope) || row.routing.operations.some((op) => inScope(op.workstationId, scope))
  );
  const scopedOrderIds = new Set(scopedOrders.map((row) => row.id));
  const lateOpen = planSnapshot.jobs.filter(
    (job) =>
      scopedOrderIds.has(job.orderId) &&
      (job.status === "LATE" || job.status === "AT_RISK")
  ).length;
  const startedInWindow = planSnapshot.jobs.filter(
    (job) => scopedOrderIds.has(job.orderId) && job.status === "RUNNING"
  ).length;
  const completedInWindow = orderRows.filter(
    (row) =>
      row.status === "COMPLETED" &&
      row.batch?.productionCompletedAt &&
      row.batch.productionCompletedAt >= window.start &&
      row.batch.productionCompletedAt <= window.end
  ).length;

  const adherence = planner.planningHealth.scheduleAdherencePercent;
  const changeoverHours = Math.round(planSnapshot.changeoverMinutesInWindow / 60);

  const kpis = [
    {
      id: "otif",
      label: "On-time delivery (OTIF)",
      value: otif.otifPercent == null ? "—" : `${otif.otifPercent}%`,
      hint: otif.sampleSize > 0 ? `${otif.onTimeCount}/${otif.sampleSize} completed by due date` : "No completions yet",
    },
    {
      id: "adherence",
      label: "Schedule adherence",
      value: adherence == null ? "—" : `${adherence}%`,
      hint: "Completed vs planned end",
    },
    {
      id: "late",
      label: "Late / at-risk jobs",
      value: String(lateOpen),
      hint: "Past due while still open in planner window",
    },
    {
      id: "changeover",
      label: "Changeover hours",
      value: `${changeoverHours}h`,
      hint: "Planned cleaning/setup in window",
    },
    {
      id: "started",
      label: "Jobs started",
      value: String(startedInWindow),
      hint: "In progress or started in window",
    },
    {
      id: "completed",
      label: "Jobs completed",
      value: String(completedInWindow),
      hint: "Batch completion in window",
    },
  ];

  const jobReport: PlannerJobReportRow[] = scopedOrders.slice(0, 40).map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    productName: order.productName,
    workstationName: order.workstationName,
    plannedStart: order.plannedStart,
    plannedEnd: order.plannedEnd,
    dueDate: order.dueDate,
    status: order.displayStatus,
    quantity: order.quantity,
    producedQuantity: order.producedQuantity,
  }));

  const timelogSince = new Date(now.getTime() - TIMELOG_HORIZON_DAYS * 86_400_000);
  const events = await prisma.productionOperationEvent.findMany({
    where: { tenantId: ctx.tenantId, recordedAt: { gte: timelogSince } },
    include: {
      recordedBy: { select: { name: true } },
      productionOperation: {
        select: {
          operationCode: true,
          workstationId: true,
          workstation: { select: { name: true } },
          productionOrder: { select: { orderNumber: true } },
        },
      },
    },
    orderBy: { recordedAt: "desc" },
    take: 80,
  });

  const orderItems: PlannerOrderItemRow[] = scopedOrders.slice(0, 60).map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    productSku: productSkuById.get(order.productId) ?? "—",
    productName: order.productName,
    quantity: order.quantity,
    dueDate: order.dueDate,
    status: order.displayStatus,
    workstationName: order.workstationName,
  }));

  const timelogs: PlannerTimelogRow[] = events
    .filter((row) => inScope(row.productionOperation.workstationId, scope))
    .map((row) => ({
    id: row.id,
    recordedAt: row.recordedAt.toISOString(),
    eventType: row.eventType,
    orderNumber: row.productionOperation.productionOrder.orderNumber,
    operationCode: row.productionOperation.operationCode,
    workstationName: row.productionOperation.workstation?.name ?? null,
    quantity: row.quantity,
    reason: row.reason,
    actorName: row.recordedBy?.name ?? null,
  }));

  const hasTimelogData = events.some((row) => row.eventType === "START" || row.eventType === "STOP");

  const wsIds = workstationCapacity.map((row) => row.id);
  const oeeByWorkstation = hasTimelogData
    ? await Promise.all(
    wsIds.map(async (workstationId) => {
      const ws = workstationCapacity.find((row) => row.id === workstationId)!;
      const ops = await prisma.productionOperation.findMany({
        where: {
          tenantId: ctx.tenantId,
          workstationId,
          plannedStart: { not: null },
          plannedEnd: { not: null },
        },
        include: {
          productionOrder: {
            select: {
              batch: { select: { producedQuantity: true, productionStartedAt: true, productionCompletedAt: true } },
            },
          },
          shopFloorEvents: { where: { recordedAt: { gte: timelogSince } } },
        },
        take: 40,
      });
      let plannedMinutes = 0;
      let actualMinutes = 0;
      let downtimeEvents = 0;
      let scrapQuantity = 0;
      let goodQuantity = 0;
      for (const op of ops) {
        if (op.plannedStart && op.plannedEnd) {
          plannedMinutes += Math.max(0, (op.plannedEnd.getTime() - op.plannedStart.getTime()) / 60000);
        }
        const batch = op.productionOrder.batch;
        if (batch?.productionStartedAt && batch.productionCompletedAt) {
          actualMinutes += Math.max(
            0,
            (batch.productionCompletedAt.getTime() - batch.productionStartedAt.getTime()) / 60000
          );
        }
        for (const event of op.shopFloorEvents) {
          if (event.eventType === "DOWNTIME") downtimeEvents += 1;
          if (event.eventType === "SCRAP") scrapQuantity += event.quantity ?? 0;
        }
        goodQuantity += batch?.producedQuantity ?? 0;
      }
      if (actualMinutes <= 0 && downtimeEvents === 0 && goodQuantity === 0) return null;
      const oee = computeOeeProxy({
        plannedMinutes: plannedMinutes || 60,
        actualMinutes: actualMinutes || plannedMinutes,
        downtimeEvents,
        scrapQuantity,
        goodQuantity,
      });
      return {
        workstationId,
        code: ws.code,
        name: ws.name,
        oeePercent: oee.oeePercent,
        availabilityPercent: oee.availabilityPercent,
        performancePercent: oee.performancePercent,
        qualityPercent: oee.qualityPercent,
      };
    })
  ).then((rows) => rows.filter((row): row is NonNullable<typeof row> => row != null))
    : [];

  return {
    generatedAt: now.toISOString(),
    window: { start: window.start.toISOString(), end: window.end.toISOString() },
    kpis,
    dailyLoad,
    workstationLoad,
    bottleneck: bottleneck
      ? { code: bottleneck.code, name: bottleneck.name, utilization: bottleneck.utilization }
      : null,
    jobReport,
    timelogs,
    orderItems,
    oeeByWorkstation: oeeByWorkstation.sort((a, b) => b.oeePercent - a.oeePercent),
    hasTimelogData,
  };
}
