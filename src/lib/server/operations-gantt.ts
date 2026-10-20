import { toneForOperation } from "@/lib/operations/planner-gantt-colors";
import { assignParallelSubLanes } from "@/lib/operations/gantt-parallel-lanes";
import { jobStatusIsLate, jobStatusIsScheduleSlip, resolveJobPlanStatus } from "@/lib/operations/plan-job-status";
import { formatRoutingIssueDetail, formatSlippedStartDetail } from "@/lib/operations/schedule-issue-format";
import {
  capacityStateFromLoad,
  scheduledOperationMinutesInWindow,
  utilizationForWorkstation,
} from "@/lib/operations/gantt-capacity";
import {
  buildOffShiftBlocks,
  buildOnShiftBlocks,
  type GanttOffShiftBlock,
} from "@/lib/operations/gantt-off-shift";
import { computeGanttLateSummary, type GanttLateSummary } from "@/lib/operations/gantt-late-summary";

export type { GanttLateSummary };
import { shortBatchLabel, workingSegmentsInRange, type GanttWorkSegment } from "@/lib/operations/gantt-shift-segments";
import { type GanttZoom, resolveGanttWindow } from "@/lib/operations/gantt-window";
import { availableWorkingMinutes, createStandardWorkCalendar } from "@/lib/operations/calendar";
import { isElapsedOnlyWorkstation } from "@/lib/operations/elapsed-workstation";
import { LAB_ALLIED_DEMO_SLUG } from "@/lib/demo-tenant";
import { getOperationsPlanner, type OperationsView } from "@/lib/server/operations";
import { getTenant } from "@/lib/server/services/tenant";
import { resolvePlannerAccess } from "@/lib/auth/planner-access";
import { requirePermission } from "@/lib/auth/authorization";
import { loadWorkstationCalendars } from "@/lib/server/aps-plan";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { buildOrderMaterialConstraints } from "@/lib/operations/material-constraints";
import type { RoutingIssue } from "@/lib/operations/routing";
import { describeUnscheduledReason } from "@/lib/operations/unscheduled-reasons";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { getOrCreatePlanningPolicy, type PlanningPolicyView, type ScheduleProposalView } from "@/lib/server/aps-plan";
import { getPlanSnapshot } from "@/lib/server/plan-snapshot";

export type GanttBar = {
  id: string;
  layer: "live" | "proposed";
  orderId: string;
  operationId: string;
  sequence: number;
  isLocked: boolean;
  qualifiedWorkstationIds: string[];
  alternativeWorkstationNames: string[];
  workstationId: string;
  orderNumber: string;
  batchLabel: string;
  productName: string;
  operationCode: string;
  operationName: string;
  start: string;
  end: string;
  dueDate: string;
  status: string;
  durationMinutes: number;
  changeoverMinutes: number;
  tone: ReturnType<typeof toneForOperation> | "ghost";
  warningReason: string | null;
  subLane: number;
  laneCount: number;
  label: string;
  shortBatchLabel: string;
  workSegments: GanttWorkSegment[];
  /** Previous plan outline when proposal changed this op */
  ghost?: { start: string; end: string; workstationId: string; workSegments: GanttWorkSegment[] } | null;
};

export type GanttFlowEdge = {
  id: string;
  orderId: string;
  fromOperationId: string;
  toOperationId: string;
};

export type GanttMaintenanceBlock = {
  id: string;
  workstationId: string;
  start: string;
  end: string;
  reason: string;
};

export type GanttDiffRow = {
  orderNumber: string;
  previousStart: string | null;
  proposedStart: string | null;
  previousEnd: string | null;
  proposedEnd: string | null;
  changeMinutes: number;
  materialState: string;
  isLocked: boolean;
};

export type GanttDiffSummary = {
  jobsMoved: number;
  newlyLate: number;
  newlyOnTime: number;
  changeoverMinutesSaved: number;
  hasChanges: boolean;
};

export type GanttWorkstationRow = {
  id: string;
  code: string;
  name: string;
  groupId: string | null;
  groupCode: string | null;
  groupName: string | null;
  elapsedOnly: boolean;
  utilization: number | null;
  scheduledHours: number;
  availableHours: number;
  capacityState: "OK" | "WARNING" | "DANGER" | "N/A";
};

export type GanttOrderTableRow = {
  tab: "unscheduled" | "scheduled" | "late" | "error";
  orderId: string;
  operationId: string;
  batchLabel: string;
  orderNumber: string;
  stepName: string;
  productName: string;
  durationHours: number;
  quantity: number;
  begin: string | null;
  end: string | null;
  dueDate: string;
  customer: string | null;
  reason: string | null;
};

export type GanttUnscheduledJob = {
  orderId: string;
  operationId: string;
  orderNumber: string;
  batchLabel: string;
  productName: string;
  stepCode: string;
  stepName: string;
  dueDate: string;
  reason: string;
  reasonDetail: string;
};

export type GanttGroup = {
  id: string;
  code: string;
  name: string;
  workstationIds: string[];
};

export type OperationsGanttSnapshot = {
  /** Server anchor for Now line / freeze band (avoids hydration drift). */
  anchorNow: string;
  window: { start: string; end: string; zoom: GanttZoom };
  groups: GanttGroup[];
  workstations: GanttWorkstationRow[];
  bars: GanttBar[];
  maintenanceBlocks: GanttMaintenanceBlock[];
  offShiftBlocks: GanttOffShiftBlock[];
  onShiftBlocks: GanttOffShiftBlock[];
  flowEdges: GanttFlowEdge[];
  unscheduledJobs: GanttUnscheduledJob[];
  orderTableRows: GanttOrderTableRow[];
  proposal: ScheduleProposalView | null;
  diff: GanttDiffRow[];
  diffSummary: GanttDiffSummary;
  planningPolicy: PlanningPolicyView;
  capabilities: OperationsView["capabilities"];
  scheduleStatusLine: string;
  rescheduleNeededBanner: string | null;
  lateSummary: GanttLateSummary;
  rowLayout: "alpha" | "group";
};

const GROUP_ORDER = [
  "LA-BLEND",
  "DISP-GRP",
  "GRN-GRP",
  "LA-COMP",
  "CMP-GRP",
  "LA-COAT",
  "COAT-GRP",
  "LA-FILL",
  "ENC-GRP",
  "LA-BLISTER",
  "LIQ-GRP",
  "PKG-GRP",
  "LA-LINE",
  "LA-QUAR",
  "LA-QC",
  "QC-GRP",
];

const STEP_LABELS: Record<string, string> = {
  DISP: "Dispensing",
  GRAN: "Granulation",
  FBD: "FBD drying",
  BLND: "Blending",
  COMP: "Compression",
  COMPRESS: "Compression",
  COAT: "Coating",
  ENC: "Encapsulation",
  ENCAPSULATE: "Encapsulation",
  COMPOUND: "Compounding",
  FILL: "Liquid filling",
  PACK: "Blister packing",
  QC: "QC hold",
  "QC-HOLD": "QC hold",
};

function stepDisplayName(code: string, name: string): string {
  const key = code.trim().toUpperCase();
  if (name && name.trim().toUpperCase() !== key) return name;
  return STEP_LABELS[key] ?? name ?? code;
}

function formatBarLabel(input: {
  tenantSlug: string;
  orderNumber: string;
  batchLabel: string;
  durationMinutes: number;
  productName: string;
}): string {
  const hours = (Math.round((input.durationMinutes / 60) * 10) / 10).toFixed(1);
  if (input.tenantSlug === LAB_ALLIED_DEMO_SLUG) {
    return `${input.orderNumber} (${hours}h) ${input.productName}`;
  }
  return `${shortBatchLabel(input.batchLabel)} (${hours}h) ${input.productName}`;
}

function buildOrderTableRows(
  planner: Awaited<ReturnType<typeof getOperationsPlanner>>,
  orderBatch: Map<string, string>,
  orderPlannedEnd: Map<string, string | null>,
  now: Date,
  activeTimers: Set<string>,
  customerByOrderId: Map<string, string>
): GanttOrderTableRow[] {
  const rows: GanttOrderTableRow[] = [];
  for (const order of planner.orders) {
    const batchLabel = orderBatch.get(order.id) ?? order.orderNumber;
    for (const op of order.routing.operations) {
      const stepName = stepDisplayName(op.code, op.name);
      const issue = planner.routingIssuesByOperationId[op.id];
      const durationHours = Math.round((op.durationMinutes / 60) * 100) / 100;
      const base = {
        orderId: order.id,
        operationId: op.id,
        batchLabel,
        orderNumber: order.orderNumber,
        stepName,
        productName: order.productName,
        durationHours,
        quantity: order.quantity,
        begin: op.plannedStart,
        end: op.plannedEnd,
        dueDate: order.dueDate,
        customer: customerByOrderId.get(order.id) ?? null,
        reason: issue?.detail ? formatRoutingIssueDetail(issue.kind, issue.detail, now) : null,
      };
      if (issue) {
        rows.push({
          ...base,
          tab: "error",
          reason: formatRoutingIssueDetail(issue.kind, issue.detail, now),
        });
        continue;
      }
      const status = resolveJobPlanStatus({
        operationStatus: op.status,
        orderKind: order.orderKind,
        plannedStart: op.plannedStart,
        plannedEnd: op.plannedEnd,
        dueDate: order.dueDate,
        isQcHold: op.isQcHold,
        hasActiveTimer: activeTimers.has(op.id),
        orderPlannedEnd: orderPlannedEnd.get(order.id) ?? null,
        now,
      });
      if (status === "UNSCHEDULED") {
        rows.push({ ...base, tab: "unscheduled", reason: base.reason });
      } else if (jobStatusIsScheduleSlip(status) && op.plannedStart) {
        rows.push({
          ...base,
          tab: "error",
          reason: formatSlippedStartDetail(new Date(op.plannedStart), now),
        });
      } else if (jobStatusIsLate(status)) {
        rows.push({ ...base, tab: "late", reason: null });
      } else if (op.plannedStart && op.plannedEnd) {
        rows.push({ ...base, tab: "scheduled", reason: null });
      }
    }
  }
  return rows;
}

function buildDiffSummary(
  proposal: ScheduleProposalView | null,
  diff: GanttDiffRow[],
  jobsMovedFromSnapshot: number
): GanttDiffSummary {
  if (!proposal) {
    return { jobsMoved: 0, newlyLate: 0, newlyOnTime: 0, changeoverMinutesSaved: 0, hasChanges: false };
  }
  const jobsMoved = jobsMovedFromSnapshot > 0 ? jobsMovedFromSnapshot : diff.length;
  const newlyLate = proposal.lateOrders;
  const newlyOnTime = diff.filter((row) => {
    if (!row.previousEnd || !row.proposedEnd) return false;
    return new Date(row.proposedEnd).getTime() <= new Date(row.previousEnd).getTime();
  }).length;
  return {
    jobsMoved,
    newlyLate,
    newlyOnTime,
    changeoverMinutesSaved: Math.max(0, proposal.totalChangeoverMinutes),
    hasChanges: jobsMoved > 0,
  };
}

function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

export async function getOperationsGanttSnapshot(
  ctx: TenantContext,
  options?: {
    zoom?: string | null;
    start?: string | null;
    end?: string | null;
    ganttRows?: string | null;
  }
): Promise<OperationsGanttSnapshot> {
  requirePermission(ctx, "production.read");
  const { ensurePlannerScheduleFreshOnLoad } = await import("@/lib/server/planner-schedule-refresh");
  await ensurePlannerScheduleFreshOnLoad(ctx);
  const ganttWindow = resolveGanttWindow(options);
  const window = { start: ganttWindow.start, end: ganttWindow.end, weeks: 2 as const };
  const materials = await getMaterialsSnapshot(ctx, resolveMaterialsFilters({})).catch(() => null);
  const [planner, planSnapshot] = await Promise.all([
    getOperationsPlanner(ctx, window, materials),
    getPlanSnapshot(ctx, { start: ganttWindow.start, end: ganttWindow.end }),
  ]);
  const prisma = getPrisma();
  const tenant = await getTenant(ctx);
  const defaultRowLayout = tenant.slug === LAB_ALLIED_DEMO_SLUG ? "alpha" : "group";
  const rowLayout: "alpha" | "group" =
    options?.ganttRows === "alpha" ? "alpha" : options?.ganttRows === "group" ? "group" : defaultRowLayout;
  const now = new Date();
  const activeTimers = new Set(planSnapshot.activeTimerOperationIds);

  const wsRows = await prisma.workstation.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    include: { group: { select: { id: true, code: true, name: true } } },
    orderBy: [{ group: { code: "asc" } }, { code: "asc" }],
  });
  const calendars = await loadWorkstationCalendars(
    ctx.tenantId,
    wsRows.map((row) => ({ id: row.id, code: row.code, capacityHoursPerDay: row.capacityHoursPerDay }))
  );

  const orderBatch = new Map<string, string>();
  for (const order of planner.orders) {
    orderBatch.set(order.id, order.orderNumber);
  }

  const proposal = planner.proposal;
  const ghostByOpId = new Map<
    string,
    { start: string; end: string; workstationId: string; changeoverMinutes: number }
  >();
  if (proposal?.id) {
    const planOps = await prisma.schedulePlanOperation.findMany({
      where: { tenantId: ctx.tenantId, planId: proposal.id },
      select: {
        productionOperationId: true,
        workstationId: true,
        proposedStart: true,
        proposedEnd: true,
        changeoverMinutes: true,
      },
    });
    for (const row of planOps) {
      if (!row.proposedStart || !row.proposedEnd || !row.workstationId) continue;
      ghostByOpId.set(row.productionOperationId, {
        start: row.proposedStart.toISOString(),
        end: row.proposedEnd.toISOString(),
        workstationId: row.workstationId,
        changeoverMinutes: row.changeoverMinutes,
      });
    }
  }

  const orderMeta = new Map(planner.orders.map((order) => [order.id, order]));
  const routingOpMeta = new Map(
    planner.orders.flatMap((order) => order.routing.operations.map((op) => [op.id, op] as const))
  );

  const dbOperations = await prisma.productionOperation.findMany({
    where: {
      tenantId: ctx.tenantId,
      plannedStart: { not: null },
      plannedEnd: { not: null },
      workstationId: { not: null },
    },
    include: {
      productionOrder: {
        select: {
          id: true,
          orderNumber: true,
          orderKind: true,
          status: true,
          dueDate: true,
          isLocked: true,
          product: { select: { name: true } },
        },
      },
      routingOperation: { select: { isQcHold: true } },
    },
    orderBy: [{ productionOrderId: "asc" }, { sequence: "asc" }],
  });

  const batchRows = await prisma.productionBatch.findMany({
    where: {
      tenantId: ctx.tenantId,
      productionOrderId: { in: [...new Set(dbOperations.map((row) => row.productionOrderId))] },
    },
    select: { productionOrderId: true, batchNumber: true },
  });
  for (const row of batchRows) {
    orderBatch.set(row.productionOrderId, row.batchNumber);
  }

  const orderPlannedEnd = new Map<string, string>();
  for (const dbOp of dbOperations) {
    if (!dbOp.plannedEnd) continue;
    const iso = dbOp.plannedEnd.toISOString();
    const prev = orderPlannedEnd.get(dbOp.productionOrderId);
    if (!prev || new Date(iso).getTime() > new Date(prev).getTime()) {
      orderPlannedEnd.set(dbOp.productionOrderId, iso);
    }
  }

  const wsNameById = new Map(wsRows.map((row) => [row.id, row.name]));
  const bars: GanttBar[] = [];
  const flowEdges: GanttFlowEdge[] = [];
  const flowByOrder = new Map<string, typeof dbOperations>();

  for (const dbOp of dbOperations) {
    const order = orderMeta.get(dbOp.productionOrderId) ?? {
      id: dbOp.productionOrder.id,
      orderNumber: dbOp.productionOrder.orderNumber,
      orderKind: dbOp.productionOrder.orderKind,
      productName: dbOp.productionOrder.product.name,
      status: dbOp.productionOrder.status,
      dueDate: dbOp.productionOrder.dueDate.toISOString(),
      isLocked: dbOp.productionOrder.isLocked,
    };
    const routingOp = routingOpMeta.get(dbOp.id);
    const plannedStart = dbOp.plannedStart!.toISOString();
    const plannedEnd = dbOp.plannedEnd!.toISOString();
    const batchLabel = orderBatch.get(order.id) ?? order.orderNumber;
    const isQcHold = dbOp.routingOperation?.isQcHold ?? routingOp?.isQcHold ?? false;
    const workstationCode = wsRows.find((row) => row.id === dbOp.workstationId)?.code ?? null;
    const tone = toneForOperation({
      orderKind: order.orderKind as "FIRM" | "PROSPECT",
      operationStatus: dbOp.status,
      orderStatus: order.status,
      plannedStart,
      plannedEnd,
      dueDate: order.dueDate,
      isQcHold,
      workstationCode,
      hasActiveTimer: activeTimers.has(dbOp.id),
      orderPlannedEnd: orderPlannedEnd.get(order.id) ?? null,
      now,
    });
    const proposed = ghostByOpId.get(dbOp.id);
    const changed =
      proposed &&
      (proposed.workstationId !== dbOp.workstationId ||
        !sameInstant(proposed.start, plannedStart) ||
        !sameInstant(proposed.end, plannedEnd));

    const qualifiedWorkstationIds =
      routingOp?.qualifiedWorkstationIds ?? (dbOp.workstationId ? [dbOp.workstationId] : []);
    const assignedWs = changed ? proposed!.workstationId : dbOp.workstationId!;
    bars.push({
      id: dbOp.id,
      layer: changed ? "proposed" : "live",
      orderId: order.id,
      operationId: dbOp.id,
      sequence: dbOp.sequence,
      isLocked: order.isLocked,
      qualifiedWorkstationIds,
      alternativeWorkstationNames: qualifiedWorkstationIds
        .filter((id) => id !== assignedWs)
        .map((id) => wsNameById.get(id))
        .filter((name): name is string => Boolean(name)),
      workstationId: assignedWs,
      orderNumber: order.orderNumber,
      batchLabel,
      productName: order.productName,
      operationCode: dbOp.operationCode,
      operationName: dbOp.operationName,
      start: changed ? proposed!.start : plannedStart,
      end: changed ? proposed!.end : plannedEnd,
      dueDate: order.dueDate,
      status: dbOp.status,
      durationMinutes: dbOp.durationMinutes,
      changeoverMinutes: changed ? proposed!.changeoverMinutes : dbOp.setupMinutes,
      warningReason: null as string | null,
      subLane: 0,
      laneCount: 1,
      tone: changed
        ? toneForOperation({
            orderKind: order.orderKind as "FIRM" | "PROSPECT",
            operationStatus: dbOp.status,
            orderStatus: order.status,
            plannedStart: proposed!.start,
            plannedEnd: proposed!.end,
            dueDate: order.dueDate,
            isQcHold,
            workstationCode,
            hasActiveTimer: activeTimers.has(dbOp.id),
            orderPlannedEnd: orderPlannedEnd.get(order.id) ?? null,
            now,
          })
        : tone,
      label: formatBarLabel({
        tenantSlug: tenant.slug,
        orderNumber: order.orderNumber,
        batchLabel,
        durationMinutes: dbOp.durationMinutes,
        productName: order.productName,
      }),
      shortBatchLabel: shortBatchLabel(batchLabel),
      workSegments: (() => {
        const wsCal =
          calendars.get(dbOp.workstationId!) ??
          createStandardWorkCalendar(wsRows.find((row) => row.id === dbOp.workstationId)?.capacityHoursPerDay ?? 8);
        const rangeStart = new Date(changed ? proposed!.start : plannedStart);
        const rangeEnd = new Date(changed ? proposed!.end : plannedEnd);
        if (isElapsedOnlyWorkstation(wsRows.find((row) => row.id === dbOp.workstationId)?.code)) {
          return [{ start: rangeStart.toISOString(), end: rangeEnd.toISOString() }];
        }
        const segments = workingSegmentsInRange(rangeStart, rangeEnd, wsCal);
        return segments.length > 0 ? segments : [{ start: rangeStart.toISOString(), end: rangeEnd.toISOString() }];
      })(),
      ghost: changed
        ? {
            start: plannedStart,
            end: plannedEnd,
            workstationId: dbOp.workstationId!,
            workSegments: workingSegmentsInRange(
              new Date(plannedStart),
              new Date(plannedEnd),
              calendars.get(dbOp.workstationId!) ??
                createStandardWorkCalendar(wsRows.find((row) => row.id === dbOp.workstationId)?.capacityHoursPerDay ?? 8)
            ),
          }
        : null,
    });

    const list = flowByOrder.get(order.id) ?? [];
    list.push(dbOp);
    flowByOrder.set(order.id, list);
  }

  const parallelCapacity = new Map(wsRows.map((row) => [row.id, row.allowedParallelJobs]));
  const laneAssignments = assignParallelSubLanes(bars, parallelCapacity);
  for (const bar of bars) {
    const lane = laneAssignments.get(bar.id);
    if (lane) {
      bar.subLane = lane.subLane;
      bar.laneCount = lane.laneCount;
    }
    const issue = planner.routingIssuesByOperationId[bar.operationId];
    if (issue) {
      bar.warningReason = formatRoutingIssueDetail(issue.kind, issue.detail, now);
      continue;
    }
    const status = resolveJobPlanStatus({
      operationStatus: bar.status,
      orderKind: (orderMeta.get(bar.orderId)?.orderKind as "FIRM" | "PROSPECT" | undefined) ?? "FIRM",
      plannedStart: bar.start,
      plannedEnd: bar.end,
      dueDate: bar.dueDate,
      isQcHold: bar.tone === "qcHold",
      hasActiveTimer: activeTimers.has(bar.operationId),
      orderPlannedEnd: orderPlannedEnd.get(bar.orderId) ?? null,
      now,
    });
    if (jobStatusIsScheduleSlip(status) && bar.start) {
      bar.warningReason = formatSlippedStartDetail(new Date(bar.start), now);
    }
  }

  for (const [orderId, ops] of flowByOrder) {
    const sorted = [...ops].sort((a, b) => a.sequence - b.sequence);
    for (let i = 1; i < sorted.length; i += 1) {
      flowEdges.push({
        id: `${sorted[i - 1].id}->${sorted[i].id}`,
        orderId,
        fromOperationId: sorted[i - 1].id,
        toOperationId: sorted[i].id,
      });
    }
  }

  const exceptions = await prisma.workstationCalendarException.findMany({
    where: {
      tenantId: ctx.tenantId,
      date: { gte: ganttWindow.start, lte: ganttWindow.end },
    },
  });
  const maintenanceBlocks: GanttMaintenanceBlock[] = exceptions.map((row) => ({
    id: row.id,
    workstationId: row.workstationId,
    start: row.date.toISOString(),
    end: new Date(row.date.getTime() + DAY_MS).toISOString(),
    reason: row.reason,
  }));

  const diff: GanttDiffRow[] = (proposal?.orders ?? [])
    .filter((row) => row.changeMinutes !== 0)
    .map((row) => ({
      orderNumber: row.orderNumber,
      previousStart: row.previousStart,
      proposedStart: row.proposedStart,
      previousEnd: row.previousEnd,
      proposedEnd: row.proposedEnd,
      changeMinutes: row.changeMinutes,
      materialState: row.materialState,
      isLocked: row.isLocked,
    }));

  const materialConstraints = materials?.materials.length
    ? buildOrderMaterialConstraints(
        materials.materials,
        planner.orders.map((row) => row.id),
        now
      )
    : new Map();

  const unscheduledJobs: GanttUnscheduledJob[] = [];
  for (const order of planner.orders) {
    const sortedOps = [...order.routing.operations].sort((a, b) => a.sequence - b.sequence);
    let predecessorUnscheduled = false;
    for (const operation of sortedOps) {
      if (operation.plannedStart && operation.plannedEnd) continue;
      const stepName = stepDisplayName(operation.code, operation.name);
      const rawIssue = planner.routingIssuesByOperationId[operation.id];
      const routingIssue: RoutingIssue | undefined = rawIssue
        ? {
            operationId: operation.id,
            orderNumber: order.orderNumber,
            kind: rawIssue.kind as RoutingIssue["kind"],
            detail: rawIssue.detail,
          }
        : undefined;
      const reason = describeUnscheduledReason({
        operationId: operation.id,
        operationCode: operation.code,
        operationName: stepName,
        orderLocked: order.isLocked,
        materialScheduleState: order.materialScheduleState,
        materialConstraint: materialConstraints.get(order.id),
        issue: routingIssue,
        predecessorUnscheduled,
      });
      unscheduledJobs.push({
        orderId: order.id,
        operationId: operation.id,
        orderNumber: order.orderNumber,
        batchLabel: orderBatch.get(order.id) ?? order.orderNumber,
        productName: order.productName,
        stepCode: operation.code,
        stepName,
        dueDate: order.dueDate,
        reason,
        reasonDetail: planner.routingIssuesByOperationId[operation.id]?.detail ?? reason,
      });
      predecessorUnscheduled = true;
    }
  }

  const movedOpIds = new Set(
    (planSnapshot.proposal?.operationMoves ?? []).filter((row) => row.moved).map((row) => row.productionOperationId)
  );
  for (const bar of bars) {
    if (!movedOpIds.has(bar.operationId) || bar.ghost) continue;
    const dbOp = dbOperations.find((row) => row.id === bar.operationId);
    if (!dbOp?.plannedStart || !dbOp.plannedEnd || !dbOp.workstationId) continue;
    const move = planSnapshot.proposal?.operationMoves.find((row) => row.productionOperationId === bar.operationId);
    if (!move?.proposedStart || !move.proposedEnd || !move.proposedWorkstationId) continue;
    const wsCal =
      calendars.get(move.proposedWorkstationId) ??
      createStandardWorkCalendar(wsRows.find((row) => row.id === move.proposedWorkstationId)?.capacityHoursPerDay ?? 8);
    bar.ghost = {
      start: dbOp.plannedStart.toISOString(),
      end: dbOp.plannedEnd.toISOString(),
      workstationId: dbOp.workstationId,
      workSegments: workingSegmentsInRange(dbOp.plannedStart, dbOp.plannedEnd, wsCal),
    };
    bar.layer = "proposed";
    bar.start = move.proposedStart;
    bar.end = move.proposedEnd;
    bar.workstationId = move.proposedWorkstationId;
    bar.workSegments = workingSegmentsInRange(new Date(move.proposedStart), new Date(move.proposedEnd), wsCal);
  }
  const jobsMovedCount = planSnapshot.proposal?.jobsMoved ?? bars.filter((bar) => bar.ghost).length;
  const diffSummary = buildDiffSummary(proposal, diff, jobsMovedCount);

  const allOps = dbOperations.map((op) => ({
    workstationId: op.workstationId,
    plannedStart: op.plannedStart,
    plannedEnd: op.plannedEnd,
    changeoverMinutes: op.setupMinutes,
  }));

  const access = await resolvePlannerAccess(ctx);
  const scope = access.scopedWorkstationIds;
  const planningPolicy = await getOrCreatePlanningPolicy(ctx);

  const groupMap = new Map<string, GanttGroup>();
  for (const ws of wsRows) {
    const gid = ws.groupId ?? `ungrouped-${ws.id}`;
    const existing = groupMap.get(gid);
    if (existing) {
      existing.workstationIds.push(ws.id);
    } else {
      groupMap.set(gid, {
        id: gid,
        code: ws.group?.code ?? "LINES",
        name: ws.group?.name ?? "Workstations",
        workstationIds: [ws.id],
      });
    }
  }

  const offShiftBlocks: GanttOffShiftBlock[] = [];
  const onShiftBlocks: GanttOffShiftBlock[] = [];
  const workstations: GanttWorkstationRow[] = wsRows
    .filter((row) => !scope?.length || scope.includes(row.id))
    .map((row) => {
      const calendar = calendars.get(row.id) ?? createStandardWorkCalendar(row.capacityHoursPerDay);
      const elapsedOnly = isElapsedOnlyWorkstation(row.code);
      if (!elapsedOnly) {
        onShiftBlocks.push(...buildOnShiftBlocks(ganttWindow.start, ganttWindow.end, row.id, calendar));
        offShiftBlocks.push(...buildOffShiftBlocks(ganttWindow.start, ganttWindow.end, row.id, calendar));
      }
      const scheduledMinutes = scheduledOperationMinutesInWindow(
        allOps,
        row.id,
        ganttWindow.start,
        ganttWindow.end
      );
      const availableMinutes = elapsedOnly
        ? 0
        : availableWorkingMinutes(ganttWindow.start, ganttWindow.end, calendar);
      const utilization = elapsedOnly
        ? null
        : utilizationForWorkstation(scheduledMinutes, calendar, ganttWindow.start, ganttWindow.end);
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        groupId: row.groupId,
        groupCode: row.group?.code ?? null,
        groupName: row.group?.name ?? null,
        elapsedOnly,
        utilization,
        scheduledHours: Math.round((scheduledMinutes / 60) * 10) / 10,
        availableHours: elapsedOnly ? 0 : Math.round((availableMinutes / 60) * 10) / 10,
        capacityState: elapsedOnly ? "N/A" : capacityStateFromLoad(utilization ?? 0),
      };
    });

  const scopedBars = scope?.length ? bars.filter((bar) => scope.includes(bar.workstationId)) : bars;

  let groups = [...groupMap.values()].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a.code);
    const bi = GROUP_ORDER.indexOf(b.code);
    if (ai === -1 && bi === -1) return a.code.localeCompare(b.code);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  if (rowLayout === "alpha") {
    groups = [
      {
        id: "alpha",
        code: "ALPHA",
        name: "",
        workstationIds: [...workstations].sort((a, b) => a.name.localeCompare(b.name)).map((row) => row.id),
      },
    ];
  }

  const orderEndForStatus = new Map<string, string | null>();
  for (const order of planner.orders) {
    const ends = order.routing.operations
      .map((op) => op.plannedEnd)
      .filter(Boolean) as string[];
    orderEndForStatus.set(
      order.id,
      ends.length ? ends.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]! : null
    );
  }
  const unscheduledReasonByOp = new Map(unscheduledJobs.map((row) => [row.operationId, row.reason]));
  const customerRows = await prisma.productionOrder.findMany({
    where: { tenantId: ctx.tenantId, id: { in: [...orderMeta.keys()] } },
    select: { id: true, customer: { select: { name: true } } },
  });
  const customerByOrderId = new Map<string, string>();
  for (const row of customerRows) {
    if (row.customer?.name) customerByOrderId.set(row.id, row.customer.name);
  }

  const orderTableRows = buildOrderTableRows(
    planner,
    orderBatch,
    orderEndForStatus,
    now,
    activeTimers,
    customerByOrderId
  ).map(
    (row) =>
      row.tab === "unscheduled" && unscheduledReasonByOp.has(row.operationId)
        ? { ...row, reason: unscheduledReasonByOp.get(row.operationId)! }
        : row
  );

  const lateSummary = computeGanttLateSummary(
    planner.orders.map((order) => ({
      id: order.id,
      orderKind: order.orderKind,
      dueDate: order.dueDate,
      routing: {
        operations: order.routing.operations.map((op) => ({
          id: op.id,
          status: op.status,
          plannedStart: op.plannedStart,
          plannedEnd: op.plannedEnd,
          isQcHold: op.isQcHold,
        })),
      },
    })),
    activeTimers,
    orderEndForStatus,
    now
  );

  const acceptedPlan = await prisma.schedulePlan.findFirst({
    where: { tenantId: ctx.tenantId, status: "ACCEPTED" },
    orderBy: { version: "desc" },
    include: { acceptedBy: { select: { name: true } } },
  });
  let scheduleStatusLine = "No accepted plan yet — run Reschedule all to generate a proposal.";
  const lateLine = `${lateSummary.lateJobs} late jobs · ${lateSummary.lateOrders} late orders`;
  if (proposal?.status === "PROPOSED" && diffSummary.hasChanges) {
    const changeoverHours = Math.round(proposal.totalChangeoverMinutes / 60);
    scheduleStatusLine = `Proposal V${proposal.version} · ${diffSummary.jobsMoved} moved · ${lateLine} · ${changeoverHours}h changeover`;
  } else if (acceptedPlan) {
    const when = acceptedPlan.acceptedAt?.toISOString().slice(11, 16) ?? "—";
    const who = acceptedPlan.acceptedBy?.name ?? "planner";
    scheduleStatusLine = `Plan V${acceptedPlan.version} · accepted ${when} UTC by ${who}`;
  } else if (proposal) {
    scheduleStatusLine = `Proposal V${proposal.version} · ${proposal.status.replace(/_/g, " ").toLowerCase()}`;
  }

  const staleSinceAccept =
    acceptedPlan?.acceptedAt != null
      ? await prisma.planningEvent.findFirst({
          where: {
            tenantId: ctx.tenantId,
            createdAt: { gt: acceptedPlan.acceptedAt },
            OR: [{ summary: { startsWith: "ROSTER_" } }, { summary: { startsWith: "WORKSTATION_" } }],
          },
          orderBy: { createdAt: "desc" },
        })
      : await prisma.planningEvent.findFirst({
          where: {
            tenantId: ctx.tenantId,
            OR: [{ summary: { startsWith: "ROSTER_" } }, { summary: { startsWith: "WORKSTATION_" } }],
          },
          orderBy: { createdAt: "desc" },
        });
  const rescheduleNeededBanner = staleSinceAccept
    ? "Reschedule needed — roster or workstation settings changed since the last accepted plan."
    : null;

  return {
    anchorNow: now.toISOString(),
    window: { start: ganttWindow.start.toISOString(), end: ganttWindow.end.toISOString(), zoom: ganttWindow.zoom },
    groups,
    workstations,
    bars: scopedBars,
    maintenanceBlocks,
    offShiftBlocks,
    onShiftBlocks,
    flowEdges,
    unscheduledJobs,
    orderTableRows,
    proposal: access.readOnlyPlanner ? null : proposal,
    diff: access.readOnlyPlanner ? [] : diff,
    diffSummary: access.readOnlyPlanner
      ? { jobsMoved: 0, newlyLate: 0, newlyOnTime: 0, changeoverMinutesSaved: 0, hasChanges: false }
      : diffSummary,
    planningPolicy,
    capabilities: {
      ...planner.capabilities,
      canSchedule: planner.capabilities.canSchedule && access.canProposeSchedule,
    },
    scheduleStatusLine,
    rescheduleNeededBanner,
    lateSummary,
    rowLayout,
  };
}

const DAY_MS = 86_400_000;
