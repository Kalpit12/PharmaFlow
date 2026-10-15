import { toneForOperation } from "@/lib/operations/planner-gantt-colors";
import { getOperationsPlanner, resolvePlanningWindow, type OperationsView } from "@/lib/server/operations";
import { resolvePlannerAccess } from "@/lib/auth/planner-access";
import { requirePermission } from "@/lib/auth/authorization";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import type { ScheduleProposalView } from "@/lib/server/aps-plan";

export type GanttBar = {
  id: string;
  layer: "live" | "ghost";
  orderId: string;
  sequence: number;
  isOrderAnchor: boolean;
  isLocked: boolean;
  qualifiedWorkstationIds: string[];
  workstationId: string;
  orderNumber: string;
  productName: string;
  operationCode: string;
  operationName: string;
  start: string;
  end: string;
  changeoverMinutes: number;
  tone: ReturnType<typeof toneForOperation> | "ghost";
  label: string;
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

export type OperationsGanttSnapshot = {
  window: OperationsView["window"];
  workstations: Array<{
    id: string;
    code: string;
    name: string;
    utilization: number;
    capacityState: "OK" | "WARNING" | "DANGER";
  }>;
  bars: GanttBar[];
  proposal: ScheduleProposalView | null;
  diff: GanttDiffRow[];
  capabilities: OperationsView["capabilities"];
};

export async function getOperationsGanttSnapshot(
  ctx: TenantContext,
  weeks: 1 | 2 | 4 = 2
): Promise<OperationsGanttSnapshot> {
  requirePermission(ctx, "production.read");
  const window = resolvePlanningWindow({ weeks: String(weeks) });
  const materials = await getMaterialsSnapshot(ctx, resolveMaterialsFilters({})).catch(() => null);
  const planner = await getOperationsPlanner(ctx, window, materials);

  const orderMeta = new Map(
    planner.orders.map((order) => [
      order.orderNumber,
      {
        productName: order.productName,
        orderKind: order.orderKind,
        status: order.status,
        dueDate: order.dueDate,
      },
    ])
  );

  const liveBars: GanttBar[] = [];
  for (const order of planner.orders) {
    const meta = orderMeta.get(order.orderNumber);
    const minSequence = order.routing.operations.reduce(
      (min, operation) => Math.min(min, operation.sequence),
      Number.POSITIVE_INFINITY
    );
    for (const operation of order.routing.operations) {
      if (!operation.workstationId || !operation.plannedStart || !operation.plannedEnd) continue;
      const tone = toneForOperation({
        orderKind: meta?.orderKind ?? "FIRM",
        operationStatus: operation.status,
        orderStatus: meta?.status ?? order.status,
        plannedEnd: operation.plannedEnd,
        dueDate: meta?.dueDate ?? order.dueDate,
        isQcHold: operation.isQcHold,
      });
      liveBars.push({
        id: operation.id,
        layer: "live",
        orderId: order.id,
        sequence: operation.sequence,
        isOrderAnchor: operation.sequence === minSequence,
        isLocked: order.isLocked,
        qualifiedWorkstationIds: operation.qualifiedWorkstationIds,
        workstationId: operation.workstationId,
        orderNumber: order.orderNumber,
        productName: order.productName,
        operationCode: operation.code,
        operationName: operation.name,
        start: operation.plannedStart,
        end: operation.plannedEnd,
        changeoverMinutes: operation.changeoverMinutes,
        tone,
        label: `${order.orderNumber} · ${operation.code}`,
      });
    }
  }

  let ghostBars: GanttBar[] = [];
  const proposal = planner.proposal;
  if (proposal?.id) {
    const prisma = getPrisma();
    const planOps = await prisma.schedulePlanOperation.findMany({
      where: { tenantId: ctx.tenantId, planId: proposal.id },
      include: {
        productionOperation: {
          select: {
            operationCode: true,
            operationName: true,
            productionOrder: {
              select: {
                id: true,
                orderNumber: true,
                orderKind: true,
                dueDate: true,
                status: true,
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    ghostBars = planOps
      .filter((row) => row.workstationId && row.proposedStart && row.proposedEnd)
      .map((row) => {
        const order = row.productionOperation.productionOrder;
        return {
          id: `ghost-${row.id}`,
          layer: "ghost" as const,
          orderId: order.id,
          sequence: 0,
          isOrderAnchor: false,
          isLocked: false,
          qualifiedWorkstationIds: [],
          workstationId: row.workstationId!,
          orderNumber: order.orderNumber,
          productName: order.product.name,
          operationCode: row.productionOperation.operationCode,
          operationName: row.productionOperation.operationName,
          start: row.proposedStart!.toISOString(),
          end: row.proposedEnd!.toISOString(),
          changeoverMinutes: row.changeoverMinutes,
          tone: "ghost" as const,
          label: `${order.orderNumber} · ${row.productionOperation.operationCode}`,
        };
      });
  }

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

  const access = await resolvePlannerAccess(ctx);
  const scope = access.scopedWorkstationIds;
  const scopedWorkstations = scope?.length
    ? planner.workstations.filter((row) => scope.includes(row.id))
    : planner.workstations;
  const scopedBars = scope?.length
    ? [...liveBars, ...ghostBars].filter((bar) => scope.includes(bar.workstationId))
    : [...liveBars, ...ghostBars];

  const readOnly = access.readOnlyPlanner;
  return {
    window: planner.window,
    workstations: scopedWorkstations.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      utilization: row.utilization,
      capacityState: row.capacityState,
    })),
    bars: scopedBars,
    proposal: readOnly ? null : proposal,
    diff: readOnly ? [] : diff,
    capabilities: {
      ...planner.capabilities,
      canSchedule: planner.capabilities.canSchedule && access.canProposeSchedule,
    },
  };
}
