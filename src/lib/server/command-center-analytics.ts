import type { CommandCenterAnalytics } from "@/lib/command-center/types";
import {
  buildInventoryHealthSegments,
  buildProcurementPipelineStages,
  buildProductionPlannedVsActual,
  toRevenueBarRows,
} from "@/lib/analytics";
import { utilizationTone } from "@/lib/charts/tokens";
import { productAggregates } from "@/lib/server/analytics";
import type { DashboardData } from "@/lib/server/dashboard";
import { getPrisma } from "@/lib/server/db";
import { trailingDays } from "@/lib/server/dates";
import type { TenantContext } from "@/lib/server/errors";
import { getInventorySnapshot, resolveInventoryFilters } from "@/lib/server/inventory";
import { toChartMillions } from "@/lib/server/money";
import type { getOperationsPlanner } from "@/lib/server/operations";
import { getProcurementSnapshot, resolveProcurementFilters } from "@/lib/server/procurement";
import { getProcurementRfqReportMetrics } from "@/lib/server/procurement-rfqs";
import { getPurchaseOrderReportMetrics } from "@/lib/server/purchase-orders";
import { getReceivingReportMetrics } from "@/lib/server/receiving";

type OperationsSnapshot = Awaited<ReturnType<typeof getOperationsPlanner>>;

export async function buildCommandCenterAnalytics(
  ctx: TenantContext,
  deps: {
    dashboard: DashboardData | null;
    operations: OperationsSnapshot | null;
  }
): Promise<CommandCenterAnalytics> {
  const now = new Date();
  const current = trailingDays(now, 30);
  const previous = { start: new Date(current.start.getTime() - 30 * 86_400_000), end: current.start };

  const [inventory, procurement, rfqMetrics, poMetrics, receivingMetrics, products, productionRows] = await Promise.all([
    getInventorySnapshot(ctx, resolveInventoryFilters({ view: "overview" })).catch(() => null),
    getProcurementSnapshot(ctx, resolveProcurementFilters({ view: "all" })).catch(() => null),
    getProcurementRfqReportMetrics(ctx).catch(() => null),
    getPurchaseOrderReportMetrics(ctx).catch(() => null),
    getReceivingReportMetrics(ctx).catch(() => null),
    productAggregates(ctx, current, previous).catch(() => []),
    getPrisma()
      .productionOrder.findMany({
        where: { tenantId: ctx.tenantId },
        select: {
          status: true,
          quantity: true,
          productId: true,
          product: { select: { name: true } },
          batch: { select: { producedQuantity: true } },
        },
      })
      .catch(
        () =>
          [] as Array<{
            status: string;
            quantity: number;
            productId: string;
            product: { name: string };
            batch: { producedQuantity: number | null } | null;
          }>
      ),
  ]);

  const salesPoints = deps.dashboard?.sales["30D"] ?? [];
  const revenueTrend = {
    points: salesPoints.map((point) => ({
      label: point.label,
      primary: point.revenue,
      secondary: point.orders,
    })),
    empty: salesPoints.length < 2,
  };

  const revenueByProduct = toRevenueBarRows(
    products
      .filter((row) => row.revenue.gt(0))
      .map((row) => ({
        id: row.productId,
        label: row.name,
        value: Number(toChartMillions(row.revenue)),
        hint: `${row.units.toLocaleString("en-KE")} units`,
        href: "/reports?view=sales",
      }))
  );

  const productionPlannedVsActual = buildProductionPlannedVsActual(
    productionRows.map((row) => ({
      productId: row.productId,
      productName: row.product.name,
      status: row.status,
      quantity: row.quantity,
      producedQuantity: row.batch?.producedQuantity ?? null,
    }))
  );

  const workstationCapacity =
    deps.operations?.workstations.map((ws) => ({
      id: ws.id,
      label: ws.name,
      value: ws.utilization,
      hint: `${ws.utilization}% utilized`,
      href: `/operations?workstation=${ws.id}`,
      tone: utilizationTone(ws.utilization),
    })) ?? [];

  const inventoryHealth = inventory
    ? buildInventoryHealthSegments({
        health: inventory.health,
        expiringSoonQty: inventory.expiringSoonQty,
      })
    : [];

  const procurementPipeline = buildProcurementPipelineStages({
    pendingReviewCount: procurement?.pendingReviewCount ?? 0,
    rfqTotal: rfqMetrics?.total ?? 0,
    rfqAwaitingResponse: rfqMetrics?.awaitingResponse ?? 0,
    rfqAwarded: rfqMetrics?.awarded ?? 0,
    poDraft: poMetrics?.draft ?? 0,
    poPendingApproval: poMetrics?.pendingApproval ?? 0,
    poApproved: poMetrics?.approved ?? 0,
    receivingAwaiting: receivingMetrics?.awaiting ?? 0,
    receivingPartial: receivingMetrics?.partial ?? 0,
  });

  return {
    revenueTrend,
    revenueByProduct,
    productionPlannedVsActual,
    productionNote:
      "Actual uses ProductionBatch.producedQuantity on completed orders only. Open pipeline has no actual output — planned is never shown as actual.",
    workstationCapacity,
    inventoryHealth,
    procurementPipeline,
    errors: {
      revenue: deps.dashboard ? null : "Commercial trend unavailable.",
      operations: deps.operations ? null : "Operations planner unavailable.",
      inventory: inventory ? null : "Inventory intelligence unavailable.",
    },
  };
}
