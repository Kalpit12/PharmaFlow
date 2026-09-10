/**
 * AI tools call analytics / domain services — never Prisma.
 * No provider is invoked here.
 */

import type { AIIntent } from "@/lib/ai/intents";
import { INTENT_TOOLS, type BusinessContext } from "@/lib/ai/context";
import type { AIToolName, ToolInput, ToolOutput } from "@/lib/ai/tools";
import { getDailyReviewSnapshot, toCompactDailyReviewContext } from "@/lib/server/daily-review";
import {
  getReportingSnapshot,
  resolveReportFilters,
  toCompactReportContext,
} from "@/lib/server/reports";
import { getDashboardData } from "@/lib/server/dashboard";
import { getForecastSnapshot, resolveForecastHorizon, toCompactForecastContext } from "@/lib/server/forecasting";
import {
  getProcurementRfqDetail,
  toCompactProcurementRfqContext,
} from "@/lib/server/procurement-rfqs";
import { getScenarioSnapshot, toCompactScenarioContext } from "@/lib/server/scenarios";
import {
  getPurchaseOrderDetail,
  toCompactPurchaseOrderContext,
} from "@/lib/server/purchase-orders";
import {
  getSupplierPerformanceSnapshot,
  resolveSupplierPerformanceFilters,
  toCompactSupplierPerformanceContext,
} from "@/lib/server/supplier-performance";
import { parseProcurementRfqRef } from "@/lib/procurement-rfq/parse";
import { parsePurchaseOrderRef } from "@/lib/purchase-orders/parse";
import { parseScenarioFromLabel } from "@/lib/scenarios/engine";
import type { TenantContext } from "@/lib/server/errors";
import { listActivities, listRegions } from "@/lib/server/services/activities";
import { listCustomers } from "@/lib/server/services/customers";
import { listOpportunities, listAttentionItems } from "@/lib/server/services/opportunities";
import { listOrders } from "@/lib/server/services/orders";
import { listProducts } from "@/lib/server/services/products";
import { listRfqs } from "@/lib/server/services/rfqs";
import { getTenant } from "@/lib/server/services/tenant";

export const AI_TOOL_SERVICES: Record<AIToolName, string> = {
  get_business_summary: "getDashboardData",
  get_sales_performance: "getDashboardData",
  get_product_performance: "getDashboardData",
  get_customer_activity: "getDashboardData",
  get_rfq_analysis: "getDashboardData",
  get_regional_performance: "getDashboardData",
  get_attention_items: "getDashboardData",
  get_opportunities: "getDashboardData",
  get_daily_review: "getDailyReviewSnapshot",
  get_forecast: "getForecastSnapshot",
  get_scenario: "getScenarioSnapshot",
  get_procurement_rfq: "getProcurementRfqDetail",
  get_purchase_order: "getPurchaseOrderDetail",
  get_supplier_performance: "getSupplierPerformanceSnapshot",
  get_report: "getReportingSnapshot",
};

function rangePreset(preset?: string): "7D" | "30D" | "90D" | "12M" {
  if (preset === "7D" || preset === "30D" || preset === "90D" || preset === "12M") return preset;
  return "30D";
}

export async function runAITool<K extends AIToolName>(
  ctx: TenantContext,
  name: K,
  input: ToolInput[K]
): Promise<ToolOutput[K] | ToolOutput[K][]> {
  if (name === "get_daily_review") {
    const snapshot = await getDailyReviewSnapshot(ctx);
    return toCompactDailyReviewContext(snapshot) as ToolOutput[K];
  }
  if (name === "get_forecast") {
    const snapshot = await getForecastSnapshot(ctx, 30);
    return toCompactForecastContext(snapshot) as ToolOutput[K];
  }
  if (name === "get_scenario") {
    const snapshot = await getScenarioSnapshot(ctx);
    return toCompactScenarioContext(snapshot) as ToolOutput[K];
  }
  if (name === "get_report") {
    const snapshot = await getReportingSnapshot(ctx, resolveReportFilters({ view: "executive" }));
    return toCompactReportContext(snapshot) as ToolOutput[K];
  }
  if (name === "get_purchase_order") {
    throw new Error("get_purchase_order requires intent label with purchase order id");
  }
  if (name === "get_supplier_performance") {
    const snapshot = await getSupplierPerformanceSnapshot(ctx, resolveSupplierPerformanceFilters({}));
    return toCompactSupplierPerformanceContext(snapshot) as ToolOutput[K];
  }

  const dashboard = await getDashboardData(ctx);
  const metric = (id: string) => dashboard.metrics.find((row) => row.id === id);

  switch (name) {
    case "get_business_summary": {
      const timeRange = (input as ToolInput["get_business_summary"]).timeRange;
      return {
        revenue: metric("revenue")?.value ?? "KSh 0",
        revenueTrend: metric("revenue")?.trend ?? "—",
        orders: metric("orders")?.value ?? "0",
        ordersTrend: metric("orders")?.trend ?? "—",
        rfqs: metric("rfqs")?.value ?? "0",
        rfqsTrend: metric("rfqs")?.trend ?? "—",
        customers: metric("customers")?.value ?? "0",
        customersTrend: metric("customers")?.trend ?? "—",
        demand: metric("demand")?.value ?? "—",
        timeRange,
      } as ToolOutput[K];
    }
    case "get_sales_performance": {
      const timeRange = (input as ToolInput["get_sales_performance"]).timeRange;
      return {
        timeRange,
        points: dashboard.sales[rangePreset(timeRange.preset)],
      } as ToolOutput[K];
    }
    case "get_product_performance": {
      const query = (input as ToolInput["get_product_performance"]).product?.toLowerCase();
      const match = query
        ? dashboard.products.find((row) => row.product.toLowerCase().includes(query))
        : dashboard.products[0];
      if (!match) {
        return {
          product: query ?? "—",
          orders: "0",
          demand: "Quiet",
          growth: "—",
          trend: "flat",
          status: "Watch",
        } as ToolOutput[K];
      }
      return {
        product: match.product,
        form: match.form,
        orders: match.orders,
        demand: match.demand,
        growth: match.growth,
        trend: match.growth === "—" ? "flat" : match.growthUp ? "up" : "down",
        status: match.status,
      } as ToolOutput[K];
    }
    case "get_customer_activity": {
      const inactive = dashboard.attention.find((item) => item.id === "inactive-customers");
      const rfq = dashboard.attention.find((item) => item.id.startsWith("rfq-"));
      const count = inactive ? Number(/^(\d+)/.exec(inactive.detail)?.[1] ?? 1) : 0;
      return {
        activeCustomers: metric("customers")?.value ?? "0",
        inactiveHighValueCount: count,
        inactiveWindowDays: 45,
        openRfqAccount: rfq?.title,
      } as ToolOutput[K];
    }
    case "get_rfq_analysis": {
      const demand = dashboard.products.find((row) => row.growth !== "—" && row.growthUp);
      const region = dashboard.regions.find((row) => row.growth !== "—" && row.activity !== "Stable");
      return {
        count: metric("rfqs")?.value ?? "0",
        trend: metric("rfqs")?.trend ?? "—",
        demandProduct: demand?.product,
        demandGrowth: demand?.growth,
        growingRegion: region?.country,
        regionGrowth: region?.growth,
      } as ToolOutput[K];
    }
    case "get_regional_performance": {
      const query = (input as ToolInput["get_regional_performance"]).region?.toLowerCase();
      const match = query
        ? dashboard.regions.find((row) => row.country.toLowerCase().includes(query))
        : dashboard.regions[0];
      if (!match) {
        return { country: query ?? "—", revenue: "KSh 0", growth: "—", activity: "Stable" } as ToolOutput[K];
      }
      return {
        country: match.country,
        revenue: match.revenue,
        growth: match.growth,
        activity: match.activity,
      } as ToolOutput[K];
    }
    case "get_attention_items":
      return dashboard.attention.map((item) => ({
        id: item.id,
        severity: item.severity,
        title: item.title,
        detail: item.detail,
        meta: item.meta,
      })) as ToolOutput[K][];
    case "get_opportunities":
      return dashboard.opportunities.map((item) => ({
        id: item.id,
        category: item.category,
        insight: item.insight,
        action: item.action,
      })) as ToolOutput[K][];
    default:
      return [] as ToolOutput[K][];
  }
}

export async function loadDomainSnapshot(ctx: TenantContext) {
  const [tenant, products, customers, orders, rfqs, regions, opportunities, attention, activities] = await Promise.all([
    getTenant(ctx),
    listProducts(ctx),
    listCustomers(ctx),
    listOrders(ctx),
    listRfqs(ctx),
    listRegions(ctx),
    listOpportunities(ctx),
    listAttentionItems(ctx),
    listActivities(ctx),
  ]);

  return { tenant, products, customers, orders, rfqs, regions, opportunities, attention, activities };
}

/** One dashboard fetch (or daily review), then slice into the tools required by the intent. */
export async function collectToolContext(
  ctx: TenantContext,
  intent: AIIntent,
  dataMode: BusinessContext["dataMode"],
  tenantBrand: string
): Promise<BusinessContext> {
  const toolsUsed = INTENT_TOOLS[intent.intent];
  const needsDashboard = toolsUsed.some(
    (name) =>
      name !== "get_daily_review" &&
      name !== "get_forecast" &&
      name !== "get_scenario" &&
      name !== "get_procurement_rfq" &&
      name !== "get_purchase_order" &&
      name !== "get_supplier_performance" &&
      name !== "get_report"
  );
  const dashboard = needsDashboard && toolsUsed.length > 0 ? await getDashboardData(ctx) : null;
  const timeRange = intent.timeRange;
  const metric = (id: string) => dashboard?.metrics.find((row) => row.id === id);
  const productQuery = intent.entities.find((e) => e.kind === "product")?.value;
  const regionQuery = intent.entities.find((e) => e.kind === "region")?.value;

  const context: BusinessContext = {
    dataMode,
    tenantId: ctx.tenantId,
    tenantBrand,
    timeRange,
    slices: intent.requiredContext,
    toolsUsed,
  };

  for (const name of toolsUsed) {
    switch (name) {
      case "get_business_summary":
        context.executiveMetrics = {
          revenue: metric("revenue")?.value ?? "KSh 0",
          revenueTrend: metric("revenue")?.trend ?? "—",
          orders: metric("orders")?.value ?? "0",
          ordersTrend: metric("orders")?.trend ?? "—",
          rfqs: metric("rfqs")?.value ?? "0",
          rfqsTrend: metric("rfqs")?.trend ?? "—",
          customers: metric("customers")?.value ?? "0",
          customersTrend: metric("customers")?.trend ?? "—",
          demand: metric("demand")?.value ?? "—",
          timeRange,
        };
        break;
      case "get_sales_performance":
        context.salesPerformance = {
          timeRange,
          points: dashboard?.sales[rangePreset(timeRange.preset)] ?? [],
        };
        break;
      case "get_product_performance": {
        const rows = dashboard?.products ?? [];
        const match = productQuery
          ? rows.filter((row) => row.product.toLowerCase().includes(productQuery.toLowerCase()))
          : rows.slice(0, 5);
        context.products = (match.length ? match : rows.slice(0, 1)).map((row) => ({
          product: row.product,
          form: row.form,
          orders: row.orders,
          demand: row.demand,
          growth: row.growth,
          trend: row.growth === "—" ? "flat" : row.growthUp ? "up" : "down",
          status: row.status,
        }));
        break;
      }
      case "get_customer_activity": {
        const inactive = dashboard?.attention.find((item) => item.id === "inactive-customers");
        const rfq = dashboard?.attention.find((item) => item.id.startsWith("rfq-"));
        context.customers = {
          activeCustomers: metric("customers")?.value ?? "0",
          inactiveHighValueCount: inactive ? Number(/^(\d+)/.exec(inactive.detail)?.[1] ?? 1) : 0,
          inactiveWindowDays: 45,
          openRfqAccount: rfq?.title,
        };
        break;
      }
      case "get_rfq_analysis": {
        const demand = dashboard?.products.find((row) => row.growth !== "—" && row.growthUp);
        const region = dashboard?.regions.find((row) => row.growth !== "—" && row.activity !== "Stable");
        context.rfqs = {
          count: metric("rfqs")?.value ?? "0",
          trend: metric("rfqs")?.trend ?? "—",
          demandProduct: demand?.product,
          demandGrowth: demand?.growth,
          growingRegion: region?.country,
          regionGrowth: region?.growth,
        };
        break;
      }
      case "get_regional_performance": {
        const rows = dashboard?.regions ?? [];
        const match = regionQuery
          ? rows.filter((row) => row.country.toLowerCase().includes(regionQuery.toLowerCase()))
          : rows.slice(0, 4);
        context.regionalPerformance = (match.length ? match : rows.slice(0, 1)).map((row) => ({
          country: row.country,
          revenue: row.revenue,
          growth: row.growth,
          activity: row.activity,
        }));
        break;
      }
      case "get_attention_items":
        context.attentionItems = (dashboard?.attention ?? []).map((item) => ({
          id: item.id,
          severity: item.severity,
          title: item.title,
          detail: item.detail,
          meta: item.meta,
        }));
        break;
      case "get_opportunities":
        context.opportunities = (dashboard?.opportunities ?? []).map((item) => ({
          id: item.id,
          category: item.category,
          insight: item.insight,
          action: item.action,
        }));
        break;
      case "get_daily_review": {
        const snapshot = await getDailyReviewSnapshot(ctx);
        context.dailyReview = toCompactDailyReviewContext(snapshot);
        break;
      }
      case "get_forecast": {
        const horizon = resolveForecastHorizon({
          horizon: intent.timeRange.label ?? intent.timeRange.preset,
        });
        const snapshot = await getForecastSnapshot(ctx, horizon);
        context.forecast = toCompactForecastContext(snapshot);
        break;
      }
      case "get_scenario": {
        const snapshot = await getScenarioSnapshot(ctx, parseScenarioFromLabel(intent.timeRange.label));
        context.scenario = toCompactScenarioContext(snapshot);
        break;
      }
      case "get_procurement_rfq": {
        const rfqId = parseProcurementRfqRef(intent.timeRange.label) ?? parseProcurementRfqRef(intent.entities.find((e) => e.kind === "rfq")?.id);
        if (!rfqId) break;
        const detail = await getProcurementRfqDetail(ctx, rfqId);
        context.procurementRfq = toCompactProcurementRfqContext(detail);
        break;
      }
      case "get_purchase_order": {
        const poId = parsePurchaseOrderRef(intent.timeRange.label) ?? parsePurchaseOrderRef(intent.entities.find((e) => e.kind === "rfq")?.id);
        if (!poId) break;
        const detail = await getPurchaseOrderDetail(ctx, poId);
        context.purchaseOrder = toCompactPurchaseOrderContext(detail);
        break;
      }
      case "get_supplier_performance": {
        const snapshot = await getSupplierPerformanceSnapshot(ctx, resolveSupplierPerformanceFilters({}));
        context.supplierPerformance = toCompactSupplierPerformanceContext(snapshot);
        break;
      }
      case "get_report": {
        const snapshot = await getReportingSnapshot(ctx, resolveReportFilters({ view: "executive" }));
        context.report = toCompactReportContext(snapshot);
        break;
      }
      default:
        break;
    }
  }

  return context;
}
