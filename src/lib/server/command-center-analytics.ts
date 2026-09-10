import type { CommandCenterAnalytics } from "@/lib/command-center/types";
import { buildProductionPlannedVsActual } from "@/lib/analytics/production";
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
        select: { status: true, quantity: true, productId: true, product: { select: { name: true } } },
      })
      .catch(() => []),
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

  const revenueByProduct = [...products]
    .filter((row) => row.revenue.gt(0))
    .sort((a, b) => Number(b.revenue.cmp(a.revenue)))
    .slice(0, 8)
    .map((row) => ({
      id: row.productId,
      label: row.name,
      value: Number(toChartMillions(row.revenue)),
      hint: `${row.units.toLocaleString("en-KE")} units`,
      href: "/inventory",
      tone: "primary" as const,
    }));

  const productionPlannedVsActual = buildProductionPlannedVsActual(
    productionRows.map((row) => ({
      productId: row.productId,
      productName: row.product.name,
      status: row.status,
      quantity: row.quantity,
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

  const expiringQty = inventory?.expiringSoonQty ?? 0;
  const inventoryHealth = inventory
    ? [
        {
          id: "HEALTHY",
          label: "Healthy",
          value: inventory.health.find((row) => row.id === "HEALTHY")?.quantity ?? 0,
          tone: "intel" as const,
          href: "/inventory?view=health&status=HEALTHY",
        },
        {
          id: "LOW",
          label: "Low stock",
          value: inventory.health.find((row) => row.id === "LOW")?.quantity ?? 0,
          tone: "material" as const,
          href: "/inventory?view=health&status=LOW",
        },
        {
          id: "EXPIRING",
          label: "Expiring soon",
          value: expiringQty,
          tone: "material" as const,
          href: "/inventory/expiry",
        },
        {
          id: "CRITICAL",
          label: "Critical / out",
          value:
            (inventory.health.find((row) => row.id === "CRITICAL")?.quantity ?? 0) +
            (inventory.health.find((row) => row.id === "OUT_OF_STOCK")?.quantity ?? 0),
          tone: "danger" as const,
          href: "/inventory?view=health&status=CRITICAL",
        },
      ]
    : [];

  const procurementPipeline = [
    {
      id: "need",
      label: "Needs review",
      count: procurement?.pendingReviewCount ?? 0,
      href: "/procurement?view=needs-review",
    },
    {
      id: "rfq",
      label: "RFQs",
      count: rfqMetrics?.total ?? 0,
      href: "/rfqs",
    },
    {
      id: "responses",
      label: "Responses",
      count: rfqMetrics ? rfqMetrics.total - rfqMetrics.awaitingResponse : 0,
      href: "/rfqs?status=responses",
    },
    {
      id: "award",
      label: "Awarded",
      count: rfqMetrics?.awarded ?? 0,
      href: "/rfqs?status=awarded",
    },
    {
      id: "po",
      label: "Purchase orders",
      count: (poMetrics?.draft ?? 0) + (poMetrics?.pendingApproval ?? 0) + (poMetrics?.approved ?? 0),
      href: "/purchase-orders",
    },
    {
      id: "receiving",
      label: "Receiving",
      count: (receivingMetrics?.awaiting ?? 0) + (receivingMetrics?.partial ?? 0),
      href: "/receiving",
    },
  ];

  return {
    revenueTrend,
    revenueByProduct,
    productionPlannedVsActual,
    productionNote:
      "Produced quantity reflects completed production orders only. Open pipeline orders have no recorded actual output.",
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
