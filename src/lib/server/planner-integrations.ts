import { buildMaterialDelaySignals, type MaterialDelaySignal } from "@/lib/operations/planner-integrations";
import { buildOrderMaterialConstraints } from "@/lib/operations/material-constraints";
import { getActiveProposal, getOrCreatePlanningPolicy } from "@/lib/server/aps-plan";
import { requirePermission } from "@/lib/auth/authorization";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { getOperationsPlanner, resolvePlanningWindow } from "@/lib/server/operations";
import { maybeTriggerShopFloorReplan } from "@/lib/server/shop-floor-replan";

export type PlannerIntegrationSnapshot = {
  materialDelays: MaterialDelaySignal[];
  capacityUtilization: string | null;
  atRiskOrders: number;
  lateOrders: number;
  openProposalName: string | null;
  scheduleAdherencePercent: number | null;
  autopilotMode: string;
};

export async function getPlannerMaterialDelaySignals(ctx: TenantContext): Promise<MaterialDelaySignal[]> {
  requirePermission(ctx, "production.read");
  const prisma = getPrisma();
  const [materials, orders] = await Promise.all([
    getMaterialsSnapshot(ctx, resolveMaterialsFilters({})).catch(() => null),
    prisma.productionOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["UNSCHEDULED", "SCHEDULED", "AT_RISK", "IN_PROGRESS"] },
      },
      select: {
        id: true,
        orderNumber: true,
        plannedStart: true,
        batch: { select: { batchNumber: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 80,
    }),
  ]);
  if (!materials?.materials.length) return [];

  const now = materials.generatedAt ? new Date(materials.generatedAt) : new Date();
  const constraints = buildOrderMaterialConstraints(
    materials.materials,
    orders.map((row) => row.id),
    now
  );

  return buildMaterialDelaySignals({
    orders: orders.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      batchNumber: row.batch?.batchNumber ?? null,
      plannedStart: row.plannedStart?.toISOString() ?? null,
    })),
    constraints,
    now,
  });
}

export async function getPlannerIntegrationSnapshot(ctx: TenantContext): Promise<PlannerIntegrationSnapshot> {
  requirePermission(ctx, "production.read");
  const window = resolvePlanningWindow({ weeks: "2" });
  const [delays, operations, policy, proposal] = await Promise.all([
    getPlannerMaterialDelaySignals(ctx),
    getOperationsPlanner(ctx, window).catch(() => null),
    getOrCreatePlanningPolicy(ctx),
    getActiveProposal(ctx),
  ]);

  return {
    materialDelays: delays,
    capacityUtilization: operations?.kpis.find((row) => row.id === "utilization")?.value ?? null,
    atRiskOrders: operations?.orders.filter((row) => row.displayStatus === "AT_RISK").length ?? 0,
    lateOrders: operations?.planningHealth.pastDueFeasibilityIssues ?? 0,
    openProposalName: proposal?.name ?? null,
    scheduleAdherencePercent: operations?.planningHealth.scheduleAdherencePercent ?? null,
    autopilotMode: policy.autopilotMode,
  };
}

/** Procurement / materials timeline change — debounced autopilot proposal when enabled. */
export async function maybeTriggerSupplyTimelineReplan(ctx: TenantContext, summary: string) {
  const policy = await getOrCreatePlanningPolicy(ctx);
  if (policy.autopilotMode === "OFF") return null;

  const prisma = getPrisma();
  const recent = await prisma.planningEvent.findFirst({
    where: {
      tenantId: ctx.tenantId,
      summary: { contains: "Supply timeline:" },
      createdAt: { gte: new Date(Date.now() - 5 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) return null;

  const { writePlanningEvent } = await import("@/lib/server/planning-events");
  const { proposeRescheduleAll, acceptSchedulePlan } = await import("@/lib/server/aps-plan");

  await writePlanningEvent(ctx, {
    eventType: "SHOP_FLOOR_TRIGGERED",
    summary: `Supply timeline: ${summary}`,
    idempotencyKey: `supply:${Date.now()}`,
  });

  const proposal = await proposeRescheduleAll(ctx);
  if (policy.autopilotMode === "AUTO_ACCEPT_UNLOCKED") {
    return acceptSchedulePlan(ctx, proposal.id);
  }
  return proposal;
}

export { maybeTriggerShopFloorReplan };
