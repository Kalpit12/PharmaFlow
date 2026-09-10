/**
 * Dashboard aggregation. UI never queries Prisma.
 *
 * Revenue rule: SUM(Order.totalAmount) where status IN (CONFIRMED, FULFILLED).
 * DRAFT and CANCELLED are excluded. Arithmetic uses Prisma.Decimal until display.
 *
 * Windows are UTC trailing periods ending at request time (see dates.ts).
 */

import { Prisma } from "@prisma/client";

import type {
  ActivityItem,
  AttentionItem,
  DashboardMetric,
  DashboardRange,
  IntelligenceSignal,
  Opportunity,
  ProductPerformanceRow,
  RegionalRow,
  SalesPoint,
} from "@/lib/mock/dashboard";
import { loadAnalytics, type ProductAgg, type RegionAgg } from "@/lib/server/analytics";
import { getInventorySnapshot, resolveInventoryFilters } from "@/lib/server/inventory";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { getProcurementAttentionCount } from "@/lib/server/procurement";
import { getSupplierDataGapCount } from "@/lib/server/suppliers";
import { countSupplierPerformanceAttention } from "@/lib/server/supplier-performance";
import { ServerError, type TenantContext } from "@/lib/server/errors";
import { formatCount, formatKes, percentChange, percentChangeCount, toChartMillions } from "@/lib/server/money";
import { getTenant } from "@/lib/server/services/tenant";

export type DashboardData = {
  brand: string;
  disclaimer: string;
  metrics: DashboardMetric[];
  sales: Record<DashboardRange, SalesPoint[]>;
  intelligence: IntelligenceSignal[];
  products: ProductPerformanceRow[];
  regions: RegionalRow[];
  attention: AttentionItem[];
  opportunities: Opportunity[];
  activity: ActivityItem[];
};

function toSalesPoints(rows: { label: string; revenue: Prisma.Decimal; orders: number; rfqs: number }[]): SalesPoint[] {
  return rows.map((row) => ({
    label: row.label,
    revenue: toChartMillions(row.revenue),
    orders: row.orders,
    rfqs: row.rfqs,
  }));
}

function productRow(row: ProductAgg): ProductPerformanceRow {
  const growth = percentChangeCount(row.units, row.previousUnits ?? 0);
  let status: ProductPerformanceRow["status"] = "Stable";
  let demand = "Steady";
  if (row.units === 0) {
    demand = "Quiet";
    status = "Watch";
  } else if (growth.text !== "—" && growth.up && row.units >= (row.previousUnits ?? 0)) {
    demand = "Strong";
    status = "High";
  } else if (growth.text !== "—" && !growth.up) {
    demand = "Soft";
    status = "Watch";
  }
  return {
    id: row.productId,
    product: row.name,
    form: row.form,
    orders: formatCount(row.units),
    demand,
    growth: growth.text,
    growthUp: growth.up,
    status,
  };
}

function regionRow(row: RegionAgg, maxRevenue: Prisma.Decimal): RegionalRow {
  const growth = percentChange(row.revenue, row.previousRevenue ?? new Prisma.Decimal(0));
  let activity: RegionalRow["activity"] = "Stable";
  if (maxRevenue.gt(0) && row.revenue.eq(maxRevenue) && row.orders > 0) activity = "High";
  else if (growth.text !== "—" && growth.up) activity = "Growing";
  return {
    id: row.regionId,
    country: row.country,
    revenue: formatKes(row.revenue),
    revenueValue: toChartMillions(row.revenue),
    growth: growth.text,
    activity,
  };
}

export async function getDashboardData(ctx: TenantContext, now = new Date()): Promise<DashboardData> {
  try {
    const tenant = await getTenant(ctx);
    const [analytics, inventory, materials, procurementPending, supplierGaps, supplierPerfAttention] = await Promise.all([
      loadAnalytics(ctx, now),
      getInventorySnapshot(ctx, resolveInventoryFilters({ view: "overview" })).catch(() => null),
      getMaterialsSnapshot(ctx, resolveMaterialsFilters({})).catch(() => null),
      getProcurementAttentionCount(ctx).catch(() => 0),
      getSupplierDataGapCount(ctx).catch(() => 0),
      countSupplierPerformanceAttention(ctx).catch(() => 0),
    ]);
    const { totals, previousTotals, products, regions } = analytics;

    const revenueTrend = percentChange(totals.revenue, previousTotals.revenue);
    const ordersTrend = percentChangeCount(totals.orders, previousTotals.orders);
    const rfqsTrend = percentChangeCount(totals.rfqs, previousTotals.rfqs);
    const customersTrend = percentChangeCount(totals.customers, previousTotals.customers);

    const unitsNow = products.reduce((sum, row) => sum + row.units, 0);
    const unitsPrev = products.reduce((sum, row) => sum + (row.previousUnits ?? 0), 0);
    const demandTrend = percentChangeCount(unitsNow, unitsPrev);

    const maxRegion = regions.reduce((max, row) => (row.revenue.gt(max) ? row.revenue : max), new Prisma.Decimal(0));

    const opportunities: Opportunity[] = analytics.opportunities.map((item, index) => ({
      id: item.id,
      index: String(index + 1).padStart(2, "0"),
      category: item.category,
      insight: item.insight,
      action: item.action,
      href: item.href,
    }));

    const intelligence: IntelligenceSignal[] = opportunities.slice(0, 2).map((item) => ({
      id: item.id,
      category: `${item.category} signal`,
      title: item.insight,
      impact: "Derived from realized orders, RFQs, and customer activity in this workspace.",
      recommendation: item.action,
      actionLabel: "Investigate",
      href: item.href,
    }));

    return {
      brand: tenant.name,
      disclaimer: tenant.status === "DEMO" ? "Demo workspace data" : "Workspace data",
      metrics: [
        {
          id: "revenue",
          label: "Revenue",
          value: formatKes(totals.revenue),
          trend: revenueTrend.text,
          trendUp: revenueTrend.up,
          period: "vs previous 30 days",
          icon: "revenue",
        },
        {
          id: "orders",
          label: "Orders",
          value: formatCount(totals.orders),
          trend: ordersTrend.text,
          trendUp: ordersTrend.up,
          period: "vs previous 30 days",
          icon: "orders",
        },
        {
          id: "rfqs",
          label: "RFQs",
          value: formatCount(totals.rfqs),
          trend: rfqsTrend.text,
          trendUp: rfqsTrend.up,
          period: "vs previous 30 days",
          icon: "rfqs",
        },
        {
          id: "customers",
          label: "Active Customers",
          value: formatCount(totals.customers),
          trend: customersTrend.text,
          trendUp: customersTrend.up,
          period: "vs previous 30 days",
          icon: "customers",
        },
        {
          id: "demand",
          label: "Product Demand",
          value: demandTrend.text,
          trend: demandTrend.text === "—" ? "—" : demandTrend.text,
          trendUp: demandTrend.up,
          period: "vs previous 30 days",
          icon: "demand",
        },
      ],
      sales: {
        "7D": toSalesPoints(analytics.series["7D"]),
        "30D": toSalesPoints(analytics.series["30D"]),
        "90D": toSalesPoints(analytics.series["90D"]),
        "12M": toSalesPoints(analytics.series["12M"]),
      },
      intelligence,
      products: products.map(productRow),
      regions: regions.map((row) => regionRow(row, maxRegion)),
      attention: [
        ...analytics.attention,
        ...(inventory && inventory.expiredQty > 0
          ? [
              {
                id: "inv-expired",
                severity: "High" as const,
                title: "Expired inventory",
                detail: `${inventory.expiredBatches} batches · ${inventory.kpis.find((kpi) => kpi.id === "expired")?.value ?? "0"} units`,
                meta: "Inventory",
                actionLabel: "Open inventory",
                href: "/inventory?view=expiry&bucket=expired",
              },
            ]
          : []),
        ...(inventory && inventory.kpis.find((kpi) => kpi.id === "low")?.value !== "0"
          ? [
              {
                id: "inv-low",
                severity: "Medium" as const,
                title: "Low stock",
                detail: `${inventory.kpis.find((kpi) => kpi.id === "low")?.value ?? "0"} items at or below safety stock`,
                meta: "Inventory",
                actionLabel: "Open inventory",
                href: "/inventory?view=health",
              },
            ]
          : []),
        ...(materials && materials.kpis.find((kpi) => kpi.id === "at-risk")?.value !== "0"
          ? [
              {
                id: "mat-risk",
                severity: materials.orderIdsAtRisk.length > 0 ? ("High" as const) : ("Medium" as const),
                title: "Material Risk",
                detail: `${materials.kpis.find((kpi) => kpi.id === "at-risk")?.value ?? "0"} materials require attention · ${materials.orderIdsAtRisk.length} production orders affected`,
                meta: "Materials",
                actionLabel: "Open material requirements",
                href: "/materials",
              },
            ]
          : []),
        ...(procurementPending > 0
          ? [
              {
                id: "proc-attention",
                severity: "High" as const,
                title: "Procurement Attention",
                detail: `${formatCount(procurementPending)} requisition${procurementPending === 1 ? "" : "s"} require review`,
                meta: "Procurement",
                actionLabel: "Open procurement planning",
                href: "/procurement?view=needs-review",
              },
            ]
          : []),
        ...(supplierGaps > 0
          ? [
              {
                id: "supplier-gaps",
                severity: "Medium" as const,
                title: "Supplier data gaps",
                detail: `${formatCount(supplierGaps)} materials have no supplier intelligence`,
                meta: "Suppliers",
                actionLabel: "Open supplier intelligence",
                href: "/suppliers?view=gaps",
              },
            ]
          : []),
        ...(supplierPerfAttention > 0
          ? [
              {
                id: "supplier-performance",
                severity: "Medium" as const,
                title: "Supplier performance",
                detail: `${formatCount(supplierPerfAttention)} supplier${supplierPerfAttention === 1 ? "" : "s"} in Watch/Risk bands`,
                meta: "Procurement",
                actionLabel: "Open supplier performance",
                href: "/supplier-performance?view=attention",
              },
            ]
          : []),
        {
          id: "forecast-outlook",
          severity: "Medium" as const,
          title: "Forward outlook",
          detail: "Review the 7 / 14 / 30 day decision-intelligence forecast",
          meta: "Forecast",
          actionLabel: "Open forecast",
          href: "/forecast",
        },
      ],
      opportunities,
      activity: analytics.activities.map((item) => ({
        id: item.id,
        time: item.createdAt.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "UTC",
        }),
        title: item.title,
        detail: item.description,
      })),
    };
  } catch (error) {
    if (error instanceof ServerError) throw error;
    throw new ServerError("Unable to load dashboard data.", "INTERNAL");
  }
}
