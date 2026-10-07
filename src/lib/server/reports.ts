import { Prisma } from "@prisma/client";

import {
  AGEING_BUCKETS,
  EXPIRY_BUCKETS,
  ageingRisk,
  expiryRisk,
  inventoryHealth,
  matchBucket,
  materialRisk,
  materialStatus,
  productionRisk,
  sharePercent,
  wholeDays,
  type ReportRisk,
  type TimeBucket,
} from "@/lib/reports/risk";
import { buildProductionPlannedVsActual } from "@/lib/analytics/production";
import { METRIC_CATALOG } from "@/lib/reports/metric-catalog";
import { getBatchesSnapshot } from "@/lib/server/batches";
import { getTraceabilityAttention } from "@/lib/server/traceability";
import { getQualityAttention } from "@/lib/server/quality";
import { emptyIntelligenceSnapshot, getIntelligenceSnapshot } from "@/lib/server/intelligence";
import { getScenarioPlanningSlice } from "@/lib/server/scenarios";
import {
  REPORT_VIEWS,
  type BucketRow,
  type HistoryPoint,
  type InventoryClassId,
  type CompactReportContext,
  type ForecastOutlookSlice,
  type ManagementAttentionItem,
  type MaterialRow,
  type RankedItem,
  type ReportKpi,
  type ReportLot,
  type ReportViewId,
  type ReportingSnapshot,
  type SalesReportSlice,
} from "@/lib/reports/types";
import { loadAnalytics, REALIZED_ORDER_STATUSES } from "@/lib/server/analytics";
import { trailingDays } from "@/lib/server/dates";
import { getForecastSnapshot } from "@/lib/server/forecasting";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { getProcurementSnapshot, resolveProcurementFilters } from "@/lib/server/procurement";
import { getProcurementRfqReportMetrics } from "@/lib/server/procurement-rfqs";
import { getReceivingReportMetrics } from "@/lib/server/receiving";
import { getPurchaseOrderReportMetrics } from "@/lib/server/purchase-orders";
import { getSupplierPerformanceReportMetrics } from "@/lib/server/supplier-performance";
import { getSupplierSnapshot, resolveSupplierFilters } from "@/lib/server/suppliers";
import { getOperationsPlanner, resolvePlanningWindow } from "@/lib/server/operations";
import { getProductionExecutionSignals } from "@/lib/server/production-execution";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { formatCount, formatKes, percentChange, toChartMillions } from "@/lib/server/money";

export { REPORT_VIEWS };
export type {
  BucketRow,
  CompactReportContext,
  RankedItem,
  ReportKpi,
  ReportLot,
  ReportViewId,
  ReportingSnapshot,
};

export type ReportFilters = {
  view: ReportViewId;
  warehouseId?: string;
  category?: string;
  classId?: InventoryClassId;
  query?: string;
  bucket?: string;
  supplierId?: string;
  workstationId?: string;
  status?: string;
  from?: string;
  to?: string;
};

const CLASS_VIEW: Partial<Record<ReportViewId, InventoryClassId>> = {
  "finished-goods": "FINISHED_GOOD",
  "raw-materials": "RAW_MATERIAL",
  packaging: "PACKAGING",
};

const CLASS_LABEL: Record<InventoryClassId, string> = {
  FINISHED_GOOD: "Finished goods",
  RAW_MATERIAL: "Raw materials",
  PACKAGING: "Packaging",
};

function parseView(value?: string): ReportViewId {
  return REPORT_VIEWS.includes(value as ReportViewId) ? (value as ReportViewId) : "executive";
}

function parseDay(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveReportFilters(input: {
  view?: string;
  warehouse?: string;
  category?: string;
  class?: string;
  q?: string;
  bucket?: string;
  supplier?: string;
  workstation?: string;
  status?: string;
  from?: string;
  to?: string;
}): ReportFilters {
  const classId =
    input.class === "FINISHED_GOOD" || input.class === "RAW_MATERIAL" || input.class === "PACKAGING"
      ? input.class
      : CLASS_VIEW[parseView(input.view)];
  return {
    view: parseView(input.view),
    warehouseId: input.warehouse || undefined,
    category: input.category || undefined,
    classId,
    query: input.q?.trim() || undefined,
    bucket: input.bucket || undefined,
    supplierId: input.supplier || undefined,
    workstationId: input.workstation || undefined,
    status: input.status || undefined,
    from: parseDay(input.from) ? input.from : undefined,
    to: parseDay(input.to) ? input.to : undefined,
  };
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asMoney(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (value == null || value === "") return new Prisma.Decimal(0);
  return new Prisma.Decimal(String(value));
}

function bucketTotals(lots: ReportLot[], buckets: TimeBucket[], field: "expiryBucket" | "ageingBucket"): BucketRow[] {
  const total = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  return buckets.map((bucket) => {
    const rows = lots.filter((lot) => lot[field] === bucket.id);
    const quantity = rows.reduce((sum, lot) => sum + lot.quantity, 0);
    const risks = rows.map((lot) => (field === "expiryBucket" ? lot.expiryRisk : lot.ageingRisk)).filter(Boolean) as ReportRisk[];
    const risk: ReportRisk = risks.includes("CRITICAL")
      ? "CRITICAL"
      : risks.includes("HIGH")
        ? "HIGH"
        : risks.includes("MEDIUM")
          ? "MEDIUM"
          : quantity > 0
            ? "LOW"
            : "HEALTHY";
    return {
      id: bucket.id,
      label: bucket.label,
      quantity,
      share: sharePercent(quantity, total),
      items: rows.length,
      risk,
    };
  });
}

function worstRisk(a: ReportRisk, b: ReportRisk): ReportRisk {
  const rank: Record<ReportRisk, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, HEALTHY: 0 };
  return rank[a] >= rank[b] ? a : b;
}

function coverageRisk(stock: number, incoming: number, requirement: number): ReportRisk {
  if (requirement <= 0) return "HEALTHY";
  const available = stock + incoming;
  if (available < requirement && stock < requirement) return incoming > 0 ? "HIGH" : "CRITICAL";
  if (stock < requirement) return "MEDIUM";
  return "HEALTHY";
}

function findings(args: {
  expiredQty: number;
  expiredLots: ReportLot[];
  atRiskOrders: number;
  shortMaterials: MaterialRow[];
  ageing: BucketRow[];
  uncovered: MaterialRow[];
  mrpShortages: number;
  mrpOrders: number;
}): string[] {
  const notes: string[] = [];
  if (args.expiredLots.length > 0) {
    const ranked = [...args.expiredLots].sort((a, b) => b.quantity - a.quantity);
    const top = ranked.slice(0, 3);
    const share = sharePercent(top.reduce((sum, lot) => sum + lot.quantity, 0), args.expiredQty);
    notes.push(
      `${args.expiredLots.length} lot${args.expiredLots.length === 1 ? "" : "s"} currently expired. ${top.length} item${top.length === 1 ? "" : "s"} account for ${share}% of that exposure.`
    );
  }
  if (args.atRiskOrders > 0) {
    notes.push(`${args.atRiskOrders} production order${args.atRiskOrders === 1 ? " is" : "s are"} currently at risk.`);
  }
  if (args.mrpShortages > 0) {
    notes.push(
      `${args.mrpShortages} material${args.mrpShortages === 1 ? "" : "s"} will not cover open production after current stock and inbound. ${args.mrpOrders} production order${args.mrpOrders === 1 ? " is" : "s are"} affected.`
    );
  }
  if (args.uncovered.length > 0 && args.mrpShortages === 0) {
    notes.push(
      `${args.uncovered.length} material${args.uncovered.length === 1 ? "" : "s"} cannot cover current production requirements even after open inbound.`
    );
  }
  if (args.shortMaterials.length > 0) {
    notes.push(`${args.shortMaterials.length} material${args.shortMaterials.length === 1 ? " is" : "s are"} below safety stock after inbound.`);
  }
  const aged = [...args.ageing].sort((a, b) => b.quantity - a.quantity)[0];
  if (aged && aged.quantity > 0 && aged.share >= 40) {
    notes.push(`Inventory ageing is concentrated in the ${aged.label} bucket (${aged.share}%).`);
  }
  return notes.length > 0 ? notes : ["Nothing requires immediate attention."];
}

type LotRecord = {
  id: string;
  batchCode: string;
  quantity: number;
  unitValue: Prisma.Decimal;
  receivedAt: Date;
  expiryDate: Date | null;
  class: InventoryClassId;
  warehouseId: string;
  supplierId: string | null;
  product: { name: string; sku: string; category: string; safetyStock: number };
  warehouse: { name: string };
  supplier: { name: string } | null;
};

type DepthRecord = {
  suppliers: Array<{ id: string; name: string }>;
  receipts: Array<{
    id: string;
    reference: string;
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    supplierName: string | null;
    expectedAt: Date;
    purchaseOrderId: string | null;
    purchaseOrderNumber: string | null;
  }>;
  boms: Array<{ productId: string; componentId: string; componentSku: string; quantityPer: Prisma.Decimal }>;
  snapshots: Array<{ capturedOn: Date; productId: string; class: InventoryClassId; quantity: number; value: Prisma.Decimal }>;
  completed: number;
  openOrders: Array<{ productId: string; quantity: number }>;
};

async function loadReportingRows(tenantId: string): Promise<{
  warehouses: Array<{ id: string; name: string }>;
  lots: LotRecord[];
}> {
  const prisma = getPrisma();
  const [warehouses, lots] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; name: string }>>(
      Prisma.sql`SELECT id, name FROM "Warehouse" WHERE "tenantId" = ${tenantId} ORDER BY name ASC`
    ),
    prisma.$queryRaw<
      Array<{
        id: string;
        batchCode: string;
        quantity: number;
        unitValue: Prisma.Decimal;
        receivedAt: Date;
        expiryDate: Date | null;
        class: InventoryClassId;
        warehouseId: string;
        supplierId: string | null;
        productName: string;
        sku: string;
        category: string;
        safetyStock: number | null;
        warehouseName: string;
        supplierName: string | null;
      }>
    >(Prisma.sql`
      SELECT
        l.id,
        l."batchCode",
        l.quantity,
        l."unitValue",
        l."receivedAt",
        l."expiryDate",
        l.class,
        l."warehouseId",
        l."supplierId",
        p.name AS "productName",
        p.sku,
        p.category,
        p."safetyStock" AS "safetyStock",
        w.name AS "warehouseName",
        s.name AS "supplierName"
      FROM "InventoryLot" l
      INNER JOIN "Product" p ON p.id = l."productId"
      INNER JOIN "Warehouse" w ON w.id = l."warehouseId"
      LEFT JOIN "Supplier" s ON s.id = l."supplierId"
      WHERE l."tenantId" = ${tenantId}
      ORDER BY l."batchCode" ASC
    `),
  ]);

  return {
    warehouses,
    lots: lots.map((lot) => ({
      id: lot.id,
      batchCode: lot.batchCode,
      quantity: lot.quantity,
      unitValue: lot.unitValue,
      receivedAt: lot.receivedAt,
      expiryDate: lot.expiryDate,
      class: lot.class,
      warehouseId: lot.warehouseId,
      supplierId: lot.supplierId,
      product: {
        name: lot.productName,
        sku: lot.sku,
        category: lot.category,
        safetyStock: lot.safetyStock ?? 0,
      },
      warehouse: { name: lot.warehouseName },
      supplier: lot.supplierName ? { name: lot.supplierName } : null,
    })),
  };
}

async function loadReportingDepth(tenantId: string): Promise<DepthRecord> {
  const empty: DepthRecord = { suppliers: [], receipts: [], boms: [], snapshots: [], completed: 0, openOrders: [] };
  const prisma = getPrisma();
  try {
    const [suppliers, receipts, boms, snapshots, completed, openOrders] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; name: string }>>(
        Prisma.sql`SELECT id, name FROM "Supplier" WHERE "tenantId" = ${tenantId} ORDER BY name ASC`
      ),
      prisma.$queryRaw<
        Array<{
          id: string;
          reference: string;
          productId: string;
          productName: string;
          sku: string;
          quantity: number;
          supplierName: string | null;
          expectedAt: Date;
          purchaseOrderId: string | null;
          purchaseOrderNumber: string | null;
        }>
      >(Prisma.sql`
        SELECT
          r.id,
          r.reference,
          r."productId",
          p.name AS "productName",
          p.sku,
          r.quantity,
          s.name AS "supplierName",
          r."expectedAt",
          r."purchaseOrderId",
          po."poNumber" AS "purchaseOrderNumber"
        FROM "InventoryReceipt" r
        INNER JOIN "Product" p ON p.id = r."productId"
        LEFT JOIN "Supplier" s ON s.id = r."supplierId"
        LEFT JOIN "purchase_orders" po ON po.id = r."purchaseOrderId"
        WHERE r."tenantId" = ${tenantId} AND r.status = 'OPEN'
        ORDER BY r."expectedAt" ASC
      `),
      prisma.$queryRaw<Array<{ productId: string; componentId: string; componentSku: string; quantityPer: Prisma.Decimal }>>(Prisma.sql`
        SELECT b."productId", b."componentId", p.sku AS "componentSku", b."quantityPer"
        FROM "BillOfMaterial" b
        INNER JOIN "Product" p ON p.id = b."componentId"
        WHERE b."tenantId" = ${tenantId}
      `),
      prisma.$queryRaw<Array<{ capturedOn: Date; productId: string; class: InventoryClassId; quantity: number; value: Prisma.Decimal }>>(Prisma.sql`
        SELECT "capturedOn", "productId", class, quantity, value
        FROM "InventorySnapshot"
        WHERE "tenantId" = ${tenantId}
        ORDER BY "capturedOn" ASC
      `),
      prisma.productionOrder.count({ where: { tenantId, status: "COMPLETED" } }),
      prisma.productionOrder.findMany({
        where: { tenantId, status: { not: "COMPLETED" } },
        select: { productId: true, quantity: true },
      }),
    ]);
    return { suppliers, receipts, boms, snapshots, completed, openOrders };
  } catch (error) {
    console.error("Reporting depth tables unavailable", error);
    return empty;
  }
}

async function loadSalesSlice(ctx: TenantContext): Promise<SalesReportSlice> {
  const now = new Date();
  const current = trailingDays(now, 30);
  const [analytics, customerAgg] = await Promise.all([
    loadAnalytics(ctx, now),
    getPrisma().order.groupBy({
      by: ["customerId"],
      where: {
        tenantId: ctx.tenantId,
        status: { in: REALIZED_ORDER_STATUSES },
        orderedAt: { gte: current.start, lt: current.end },
      },
      _sum: { totalAmount: true },
      _count: true,
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 8,
    }),
  ]);

  const priorZero = analytics.previousTotals.revenue.isZero();
  const growth = percentChange(analytics.totals.revenue, analytics.previousTotals.revenue);
  const ordersGrowth = percentChange(new Prisma.Decimal(analytics.totals.orders), new Prisma.Decimal(analytics.previousTotals.orders));
  const customerIds = customerAgg.map((row) => row.customerId);
  const customerNames = customerIds.length
    ? await getPrisma().customer.findMany({
        where: { tenantId: ctx.tenantId, id: { in: customerIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(customerNames.map((row) => [row.id, row.name]));
  const customerTotal = customerAgg.reduce((sum, row) => sum.add(row._sum.totalAmount ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));

  return {
    revenue: formatKes(analytics.totals.revenue),
    revenueGrowth: priorZero ? "—" : growth.text,
    orders: analytics.totals.orders,
    ordersGrowth: analytics.previousTotals.orders === 0 ? "—" : ordersGrowth.text,
    rfqs: analytics.totals.rfqs,
    priorRevenueZero: priorZero,
    definition: "Confirmed + fulfilled order total. Draft and cancelled orders are excluded.",
    series: analytics.series["30D"].map((row) => ({
      label: row.label,
      revenue: toChartMillions(row.revenue),
      orders: row.orders,
      rfqs: row.rfqs,
    })),
    regions: analytics.regions.map((row) => ({
      id: row.regionId,
      country: row.country,
      revenue: formatKes(row.revenue),
      orders: row.orders,
      href: `/reports?view=sales&q=${encodeURIComponent(row.country)}`,
    })),
    products: analytics.products.slice(0, 8).map((row) => ({
      id: row.productId,
      name: row.name,
      revenue: formatKes(row.revenue),
      units: row.units,
      href: `/reports?view=inventory&q=${encodeURIComponent(row.name)}`,
    })),
    customers: customerAgg.map((row) => {
      const amount = row._sum.totalAmount ?? new Prisma.Decimal(0);
      const share =
        customerTotal.isZero() ? "—" : `${amount.div(customerTotal).mul(100).toDecimalPlaces(0).toString()}%`;
      return {
        id: row.customerId,
        name: nameById.get(row.customerId) ?? "Customer",
        revenue: formatKes(amount),
        share,
        href: "/customers",
      };
    }),
    empty: analytics.totals.orders === 0,
  };
}

export function toCompactReportContext(snapshot: ReportingSnapshot): CompactReportContext {
  const limited: string[] = [];
  if (snapshot.sales.priorRevenueZero) limited.push("Prior-period revenue is zero — growth shown as —");
  if (snapshot.history.length < 2) limited.push("Inventory history trend unavailable");
  if (snapshot.materialPlan.supplierPerfDiscrepancyRate === null) limited.push("Supplier discrepancy rate insufficient");
  return {
    view: snapshot.view,
    revenue: snapshot.sales.revenue,
    revenueGrowth: snapshot.sales.revenueGrowth,
    productionAtRisk: snapshot.production.atRisk,
    expiredQty: snapshot.kpis.find((kpi) => kpi.id === "expired")?.value ?? "0",
    materialShortages: snapshot.materialPlan.atRisk,
    procurementOpen: snapshot.executiveKpis.find((kpi) => kpi.id === "proc-exposure")?.value ?? "—",
    supplierAttention: snapshot.materialPlan.supplierPerfAttention,
    signals: snapshot.managementAttention.slice(0, 6).map((row) => ({
      domain: row.domain,
      issue: row.issue,
      severity: row.severity,
    })),
    limitedData: limited,
  };
}

export async function getReportingSnapshot(ctx: TenantContext, filters: ReportFilters): Promise<ReportingSnapshot> {
  const prisma = getPrisma();
  const now = new Date();
  const from = parseDay(filters.from);
  const to = parseDay(filters.to);
  const toEnd = to ? new Date(to.getTime() + 86_400_000 - 1) : null;

  const [tenant, inventory, planner, depth, productionRows, executionSignals] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, status: true } }),
    loadReportingRows(ctx.tenantId),
    getOperationsPlanner(ctx, resolvePlanningWindow({ weeks: "1" })).catch((error) => {
      console.error("Reports production slice failed", error);
      return {
        brand: "",
        disclaimer: "",
        window: { start: now.toISOString(), end: now.toISOString(), weeks: 1 as const },
        kpis: [],
        workstations: [],
        orders: [],
        conflicts: [],
        attention: [],
      };
    }),
    loadReportingDepth(ctx.tenantId),
    prisma.productionOrder
      .findMany({
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
    getProductionExecutionSignals(ctx),
  ]);
  const [materialPlan, procurementPlan, supplierPlan, batchPlan, traceabilityAttention, qualityAttention, intelligence, scenarioPlanning] =
    await Promise.all([
    getMaterialsSnapshot(ctx, resolveMaterialsFilters({})).catch(() => null),
    getProcurementSnapshot(ctx, resolveProcurementFilters({ view: "all" })).catch(() => null),
    getSupplierSnapshot(ctx, resolveSupplierFilters({ view: "all" })).catch(() => null),
    getBatchesSnapshot(ctx, { view: "all" }).catch(() => null),
    getTraceabilityAttention(ctx).catch(() => []),
    getQualityAttention(ctx).catch(() => []),
    filters.view === "executive" ? getIntelligenceSnapshot(ctx) : Promise.resolve(emptyIntelligenceSnapshot()),
    filters.view === "executive" ? getScenarioPlanningSlice(ctx).catch(() => null) : Promise.resolve(null),
  ]);
  const [rfqMetrics, poMetrics, receivingMetrics, supplierPerfMetrics] = await Promise.all([
    getProcurementRfqReportMetrics(ctx).catch(() => null),
    getPurchaseOrderReportMetrics(ctx).catch(() => null),
    getReceivingReportMetrics(ctx).catch(() => null),
    getSupplierPerformanceReportMetrics(ctx).catch(() => null),
  ]);
  const sales = await loadSalesSlice(ctx).catch((): SalesReportSlice => ({
    revenue: "—",
    revenueGrowth: "—",
    orders: 0,
    ordersGrowth: "—",
    priorRevenueZero: true,
    definition: "Confirmed + fulfilled order total. Draft and cancelled orders are excluded.",
    series: [],
    regions: [],
    products: [],
    customers: [],
    rfqs: 0,
    empty: true,
  }));
  const forecast = await getForecastSnapshot(ctx, 30).catch(() => null);
  const { warehouses, lots } = inventory;

  const mapped: ReportLot[] = lots.map((lot) => {
    const receivedAt = asDate(lot.receivedAt) ?? now;
    const expiryDate = asDate(lot.expiryDate);
    const unitValue = asMoney(lot.unitValue);
    const ageDays = Math.max(0, wholeDays(receivedAt, now));
    const daysRemaining = expiryDate ? wholeDays(now, expiryDate) : null;
    const expiryBucket = daysRemaining === null ? null : matchBucket(daysRemaining, EXPIRY_BUCKETS).id;
    return {
      id: lot.id,
      batchCode: lot.batchCode,
      productName: lot.product.name,
      sku: lot.product.sku,
      category: lot.product.category,
      warehouseId: lot.warehouseId,
      warehouseName: lot.warehouse.name,
      supplierId: lot.supplierId,
      supplierName: lot.supplier?.name ?? null,
      classId: lot.class,
      quantity: lot.quantity,
      valueAmount: Number(unitValue.mul(lot.quantity).toDecimalPlaces(2).toString()),
      value: formatKes(unitValue.mul(lot.quantity)),
      receivedAt: receivedAt.toISOString(),
      expiryDate: expiryDate?.toISOString() ?? null,
      daysRemaining,
      ageDays,
      expiryBucket,
      ageingBucket: matchBucket(ageDays, AGEING_BUCKETS).id,
      expiryRisk: daysRemaining === null ? null : expiryRisk(daysRemaining),
      ageingRisk: ageingRisk(ageDays),
      safetyStock: lot.product.safetyStock,
      materialStatus: materialStatus(lot.quantity, lot.product.safetyStock),
    };
  });

  const scoped = mapped.filter((lot) => {
    if (filters.warehouseId && lot.warehouseId !== filters.warehouseId) return false;
    if (filters.category && lot.category !== filters.category) return false;
    if (filters.classId && lot.classId !== filters.classId) return false;
    if (filters.supplierId && lot.supplierId !== filters.supplierId) return false;
    if (from || toEnd) {
      const received = new Date(lot.receivedAt).getTime();
      if (Number.isNaN(received)) return false;
      if (from && received < from.getTime()) return false;
      if (toEnd && received > toEnd.getTime()) return false;
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      if (
        ![lot.productName, lot.sku, lot.batchCode, lot.warehouseName, lot.supplierName ?? ""].some((value) =>
          value.toLowerCase().includes(q)
        )
      ) {
        return false;
      }
    }
    if (filters.bucket) {
      if (filters.view === "ageing" && lot.ageingBucket !== filters.bucket) return false;
      if (filters.view !== "ageing" && lot.expiryBucket !== filters.bucket) return false;
    }
    return true;
  });

  const quantity = scoped.reduce((sum, lot) => sum + lot.quantity, 0);
  const valueAmount = scoped.reduce((sum, lot) => sum + lot.valueAmount, 0);
  const expired = scoped.filter((lot) => lot.expiryRisk === "CRITICAL");
  const expiringSoon = scoped.filter((lot) => lot.expiryRisk === "HIGH");
  const atRiskInv = scoped.filter((lot) => lot.expiryRisk === "CRITICAL" || lot.expiryRisk === "HIGH");
  const expiredQty = expired.reduce((sum, lot) => sum + lot.quantity, 0);

  const incomingBySku = new Map<string, { qty: number; names: Set<string> }>();
  for (const row of depth.receipts) {
    const current = incomingBySku.get(row.sku) ?? { qty: 0, names: new Set<string>() };
    current.qty += row.quantity;
    if (row.supplierName) current.names.add(row.supplierName);
    incomingBySku.set(row.sku, current);
  }

  const requirementBySku = new Map<string, number>();
  for (const order of depth.openOrders) {
    const lines = depth.boms.filter((bom) => bom.productId === order.productId);
    for (const line of lines) {
      const need = Number(asMoney(line.quantityPer).mul(order.quantity).toDecimalPlaces(3).toString());
      requirementBySku.set(line.componentSku, (requirementBySku.get(line.componentSku) ?? 0) + need);
    }
  }

  const materialGroups = new Map<
    string,
    { title: string; stock: number; safety: number; classId: InventoryClassId; suppliers: Set<string> }
  >();
  for (const lot of scoped.filter((row) => row.classId !== "FINISHED_GOOD")) {
    const current = materialGroups.get(lot.sku) ?? {
      title: lot.productName,
      stock: 0,
      safety: lot.safetyStock,
      classId: lot.classId,
      suppliers: new Set<string>(),
    };
    current.stock += lot.quantity;
    if (lot.supplierName) current.suppliers.add(lot.supplierName);
    materialGroups.set(lot.sku, current);
  }

  const materials: MaterialRow[] = [...materialGroups.entries()]
    .map(([sku, row]) => {
      const incoming = incomingBySku.get(sku);
      const inbound = incoming?.qty ?? 0;
      incoming?.names.forEach((name) => row.suppliers.add(name));
      const requirement = requirementBySku.get(sku) ?? 0;
      const available = row.stock + inbound;
      const status = materialStatus(available, row.safety);
      const risk = worstRisk(materialRisk(status), coverageRisk(row.stock, inbound, requirement));
      return {
        id: sku,
        title: row.title,
        classId: row.classId,
        stock: row.stock,
        incoming: inbound,
        requirement: Math.round(requirement),
        available,
        coverage: Math.round(available - requirement),
        safety: row.safety,
        status,
        risk,
        suppliers: [...row.suppliers],
        hasBom: requirementBySku.has(sku),
        projected: available - Math.round(requirement),
        netRequirement: Math.max(0, Math.round(requirement) - available),
        affectedOrders: 0,
        earliestDue: null,
        mrpRisk: null,
      };
    })
    .sort((a, b) => Number(a.risk === "HEALTHY") - Number(b.risk === "HEALTHY") || a.coverage - b.coverage);

  if (materialPlan) {
    const bySku = new Map(materialPlan.materials.map((row) => [row.sku, row]));
    for (const row of materials) {
      const mrp = bySku.get(row.id);
      if (!mrp) continue;
      row.projected = mrp.projectedAvailable;
      row.netRequirement = mrp.netRequirement;
      row.affectedOrders = mrp.affectedOrders.length;
      row.earliestDue = mrp.earliestDueDate;
      row.mrpRisk = mrp.risk;
      row.hasBom = true;
      row.requirement = Math.round(mrp.grossRequirement);
      row.incoming = mrp.incoming;
      row.stock = mrp.available;
      row.available = mrp.available + mrp.incoming;
      row.coverage = Math.round(mrp.projectedAvailable);
    }
  }

  const expiryLots = scoped.filter((lot) => lot.expiryBucket);
  const expiryBuckets = bucketTotals(expiryLots, EXPIRY_BUCKETS, "expiryBucket");
  const ageingBuckets = bucketTotals(scoped, AGEING_BUCKETS, "ageingBucket");

  const productionOrders = planner.orders.filter((order) => {
    if (filters.workstationId && order.workstationId !== filters.workstationId) return false;
    if (filters.status && order.displayStatus !== filters.status) return false;
    return true;
  });
  const late = productionOrders.filter((order) => order.displayStatus === "AT_RISK").length;
  const statusCounts = [
    { id: "UNSCHEDULED", label: "Unscheduled", count: productionOrders.filter((order) => order.displayStatus === "UNSCHEDULED").length },
    { id: "SCHEDULED", label: "Scheduled", count: productionOrders.filter((order) => order.displayStatus === "SCHEDULED").length },
    { id: "AT_RISK", label: "At risk", count: late },
    { id: "COMPLETED", label: "Completed", count: filters.status && filters.status !== "COMPLETED" ? 0 : depth.completed },
  ];
  const production = {
    scheduled: productionOrders.filter((order) => order.displayStatus !== "UNSCHEDULED").length,
    unscheduled: productionOrders.filter((order) => order.displayStatus === "UNSCHEDULED").length,
    atRisk: late,
    late,
    critical: productionOrders.filter((order) => order.priority === "CRITICAL").length,
    completed: depth.completed,
    inProgress: productionOrders.filter((order) => order.displayStatus === "SCHEDULED").length,
    utilization: planner.kpis.find((kpi) => kpi.id === "utilization")?.value ?? "—",
    statuses: statusCounts,
    lines: planner.workstations.map((ws) => ({
      id: ws.id,
      name: ws.name,
      utilization: ws.utilization,
      orders: productionOrders.filter((order) => order.workstationId === ws.id && order.plannedStart).length,
    })),
    dueRisk: productionOrders
      .filter((order) => order.displayStatus === "AT_RISK")
      .map((order) => ({
        id: order.id,
        title: order.orderNumber,
        detail: order.productName,
        quantity: order.quantity,
        risk: "HIGH" as ReportRisk,
        meta: order.workstationName ?? "Unassigned",
      })),
    orders: productionOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      productName: order.productName,
      workstationId: order.workstationId,
      workstationName: order.workstationName,
      displayStatus: order.displayStatus,
      quantity: order.quantity,
      priority: order.priority,
      dueDate: order.dueDate,
      plannedStart: order.plannedStart,
      plannedEnd: order.plannedEnd,
    })),
    workstations: planner.workstations.map((ws) => ({ id: ws.id, name: ws.name })),
    plannedVsActual: buildProductionPlannedVsActual(
      productionRows.map((row) => ({
        productId: row.productId,
        productName: row.product.name,
        status: row.status,
        quantity: row.quantity,
        producedQuantity: row.batch?.producedQuantity ?? null,
      }))
    ),
  };

  const composition = (["FINISHED_GOOD", "RAW_MATERIAL", "PACKAGING"] as InventoryClassId[]).map((id) => {
    const qty = scoped.filter((lot) => lot.classId === id).reduce((sum, lot) => sum + lot.quantity, 0);
    return { id, label: CLASS_LABEL[id], quantity: qty, share: sharePercent(qty, quantity) };
  });

  const bySku = new Map<string, { title: string; quantity: number }>();
  for (const lot of scoped) {
    const current = bySku.get(lot.sku) ?? { title: lot.productName, quantity: 0 };
    current.quantity += lot.quantity;
    bySku.set(lot.sku, current);
  }
  const topSku = [...bySku.entries()].sort((a, b) => b[1].quantity - a[1].quantity)[0];
  const concentration = topSku
    ? { sku: topSku[0], title: topSku[1].title, quantity: topSku[1].quantity, share: sharePercent(topSku[1].quantity, quantity) }
    : null;

  const highValue: RankedItem[] = [...scoped]
    .sort((a, b) => b.valueAmount - a.valueAmount)
    .slice(0, 8)
    .map((lot) => ({
      id: lot.id,
      title: lot.productName,
      detail: lot.batchCode,
      quantity: lot.quantity,
      risk: lot.expiryRisk ?? lot.ageingRisk,
      meta: lot.value,
    }));

  const topExpiry: RankedItem[] = [...expired, ...expiringSoon]
    .sort((a, b) => a.daysRemaining! - b.daysRemaining! || b.quantity - a.quantity)
    .slice(0, 8)
    .map((lot) => ({
      id: lot.id,
      title: lot.productName,
      detail: lot.batchCode,
      quantity: lot.quantity,
      risk: lot.expiryRisk ?? "MEDIUM",
      meta: lot.daysRemaining !== null && lot.daysRemaining < 0 ? `${Math.abs(lot.daysRemaining)} days overdue` : `${lot.daysRemaining} days remaining`,
    }));

  const historyMap = new Map<string, { quantity: number; value: number }>();
  for (const row of depth.snapshots) {
    const captured = asDate(row.capturedOn);
    if (!captured) continue;
    if (from && captured.getTime() < from.getTime()) continue;
    if (toEnd && captured.getTime() > toEnd.getTime()) continue;
    if (filters.classId && row.class !== filters.classId) continue;
    const key = captured.toISOString().slice(0, 10);
    const current = historyMap.get(key) ?? { quantity: 0, value: 0 };
    current.quantity += row.quantity;
    current.value += Number(asMoney(row.value).toDecimalPlaces(2).toString());
    historyMap.set(key, current);
  }
  const history: HistoryPoint[] = [...historyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, row]) => ({
      date,
      label: new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
      quantity: row.quantity,
      value: row.value,
    }));

  const shortMaterials = materials.filter((row) => row.risk === "CRITICAL" || row.risk === "HIGH");
  const uncovered = materials.filter((row) => row.hasBom && row.coverage < 0);
  const mrpRows = materialPlan?.materials ?? [];
  const mrpShortages = mrpRows.filter((row) => row.shortage);
  const mrpShortageQty = mrpShortages.reduce((sum, row) => sum + row.netRequirement, 0);
  const topShortage = [...mrpShortages].sort((a, b) => b.netRequirement - a.netRequirement)[0];
  const incomingCoverageKpi = materialPlan?.kpis.find((kpi) => kpi.id === "incoming")?.value ?? "0%";

  const kpis: ReportKpi[] = [
    {
      id: "inventory",
      label: "Total inventory",
      value: formatCount(quantity),
      hint: `${scoped.length} lots in scope`,
      risk: quantity > 0 ? "HEALTHY" : "LOW",
      href: "/inventory",
      available: true,
    },
    {
      id: "value",
      label: "Inventory value",
      value: formatKes(new Prisma.Decimal(valueAmount.toFixed(2))),
      hint: "Quantity × unit value",
      risk: "HEALTHY",
      href: "/inventory",
      available: true,
    },
    {
      id: "expired",
      label: "Expired inventory",
      value: formatCount(expiredQty),
      hint: `${expired.length} lots`,
      risk: expiredQty > 0 ? "CRITICAL" : "HEALTHY",
      href: "/inventory?view=expiry&bucket=expired",
      available: true,
    },
    {
      id: "soon",
      label: "Expiring soon",
      value: formatCount(expiringSoon.reduce((sum, lot) => sum + lot.quantity, 0)),
      hint: "0–30 days",
      risk: expiringSoon.length > 0 ? "HIGH" : "HEALTHY",
      href: "/inventory?view=expiry&bucket=0-30",
      available: true,
    },
    {
      id: "risk-inv",
      label: "At-risk inventory",
      value: formatCount(atRiskInv.reduce((sum, lot) => sum + lot.quantity, 0)),
      hint: "Expired or ≤30 days",
      risk: atRiskInv.length > 0 ? "HIGH" : "HEALTHY",
      href: "/inventory?view=expiry",
      available: true,
    },
    {
      id: "production",
      label: "Production orders",
      value: formatCount(planner.orders.length),
      hint: "Current planner window",
      risk: productionRisk(production.atRisk > 0 ? "AT_RISK" : "SCHEDULED"),
      href: "/reports?view=production",
      available: true,
    },
    {
      id: "late",
      label: "Late production",
      value: formatCount(executionSignals?.late ?? production.late),
      hint: "Past planned end while incomplete",
      risk: (executionSignals?.late ?? production.late) > 0 ? "HIGH" : "HEALTHY",
      href: "/execution/production?view=at-risk",
      available: true,
    },
    {
      id: "exec-active",
      label: "Active production",
      value: formatCount(executionSignals?.active ?? 0),
      hint: "Shop-floor in progress",
      risk: (executionSignals?.paused ?? 0) > 0 ? "MEDIUM" : "HEALTHY",
      href: "/execution/production?view=active",
      available: true,
    },
    {
      id: "exec-paused",
      label: "Paused production",
      value: formatCount(executionSignals?.paused ?? 0),
      hint: "Awaiting resume",
      risk: (executionSignals?.paused ?? 0) > 0 ? "HIGH" : "HEALTHY",
      href: "/execution/production?view=paused",
      available: true,
    },
    {
      id: "shortages",
      label: "Material shortages",
      value: formatCount(mrpShortages.length || uncovered.length),
      hint: mrpShortages.length > 0 ? `${formatCount(Math.round(mrpShortageQty))} net short` : "Projected below zero after inbound",
      risk: (materialPlan?.orderIdsAtRisk.length ?? uncovered.length) > 0 ? "CRITICAL" : shortMaterials.length > 0 ? "HIGH" : "HEALTHY",
      href: "/materials?view=shortages",
      available: true,
    },
  ];

  const skuHealth = new Map<string, { qty: number; safety: number }>();
  for (const lot of scoped) {
    const current = skuHealth.get(lot.sku) ?? { qty: 0, safety: lot.safetyStock };
    current.qty += lot.quantity;
    skuHealth.set(lot.sku, current);
  }
  const healthIds = ["HEALTHY", "LOW", "CRITICAL", "OUT_OF_STOCK"] as const;
  const health = healthIds.map((id) => {
    const rows = [...skuHealth.entries()].filter(([, row]) => inventoryHealth(row.qty, row.safety) === id);
    return {
      id,
      label: id.replace(/_/g, " "),
      count: rows.length,
      quantity: rows.reduce((sum, [, row]) => sum + row.qty, 0),
    };
  });

  const approvedValueLabel =
    poMetrics?.approvedValue != null && poMetrics.approvedCurrency
      ? `${poMetrics.approvedCurrency} ${poMetrics.approvedValue.toLocaleString("en-KE")}`
      : "—";
  const openQty = receivingMetrics?.outstandingQty ?? 0;
  const forecastOutlook: ForecastOutlookSlice = {
    horizon: forecast?.horizonLabel ?? "30 days",
    sales: forecast?.sales.projectedValue ?? "Insufficient data",
    production: forecast?.production.projectedValue ?? "Insufficient data",
    materials: forecast?.materials.projectedValue ?? "Insufficient data",
    procurement: forecast?.procurement.projectedValue ?? "Insufficient data",
    confidence: forecast?.sales.confidence ?? "INSUFFICIENT",
    href: "/forecast",
  };

  const managementAttention: ManagementAttentionItem[] = [];
  if (production.atRisk > 0) {
    managementAttention.push({
      id: "ops-risk",
      domain: "Operations",
      severity: production.critical > 0 ? "CRITICAL" : "HIGH",
      issue: `${production.atRisk} production order${production.atRisk === 1 ? "" : "s"} are AT_RISK.`,
      evidence: `${production.late} late vs due date · ${production.critical} critical priority`,
      impact: "Schedule and material cover for at-risk orders.",
      href: "/operations",
    });
  }
  if (mrpShortages.length > 0 && topShortage) {
    managementAttention.push({
      id: "mat-short",
      domain: "Materials",
      severity: "CRITICAL",
      issue: `${topShortage.name} has projected shortage against production demand.`,
      evidence: `Net requirement ${Math.round(topShortage.netRequirement).toLocaleString("en-KE")} · ${materialPlan?.orderIdsAtRisk.length ?? 0} orders affected`,
      impact: "Material requirements planning — gross − available − incoming.",
      href: "/materials?view=shortages",
    });
  }
  if (expiredQty > 0) {
    managementAttention.push({
      id: "inv-exp",
      domain: "Inventory",
      severity: "CRITICAL",
      issue: `${formatCount(expiredQty)} units are expired.`,
      evidence: `${expired.length} lots in expiry CRITICAL`,
      impact: "Usable stock and write-off exposure.",
      href: "/inventory?view=expiry&bucket=expired",
    });
  }
  if (openQty > 0) {
    managementAttention.push({
      id: "po-open",
      domain: "Procurement",
      severity: "HIGH",
      issue: "Open PO exposure remains unreceived.",
      evidence: `${formatCount(openQty)} outstanding units · ${receivingMetrics?.awaiting ?? 0} POs awaiting receipt`,
      impact: "Receiving closes inventory and procurement exposure.",
      href: "/receiving?view=awaiting",
    });
  }
  if ((supplierPerfMetrics?.attentionCount ?? 0) > 0) {
    const top = supplierPerfMetrics?.topAttention[0];
    managementAttention.push({
      id: "sup-risk",
      domain: "Suppliers",
      severity: "MEDIUM",
      issue: top
        ? `${top.name} has elevated receiving or completion risk.`
        : `${supplierPerfMetrics!.attentionCount} suppliers in Watch/Risk bands.`,
      evidence: top?.reason ?? "Deterministic Phase 25 performance bands",
      impact: "Investigate RFQ, PO, and receiving history before changing source.",
      href: "/supplier-performance?view=attention",
    });
  }
  if (forecast?.risks[0]) {
    managementAttention.push({
      id: "fc-risk",
      domain: "Forecast",
      severity: forecast.risks[0].severity === "CRITICAL" || forecast.risks[0].severity === "HIGH" ? forecast.risks[0].severity : "MEDIUM",
      issue: forecast.risks[0].title,
      evidence: forecast.risks[0].reason,
      impact: `Near-term outlook (${forecast.horizonLabel}).`,
      href: "/forecast",
    });
  }
  for (const item of batchPlan?.attention ?? []) {
    managementAttention.push({
      id: item.id,
      domain: "Quality",
      severity: item.severity === "WARNING" ? "MEDIUM" : item.severity,
      issue: item.title,
      evidence: item.detail,
      impact: "Batch quality review — explicit hold, release, or reject required.",
      href: item.href,
    });
  }
  for (const item of traceabilityAttention) {
    managementAttention.push({
      id: item.id,
      domain: "Traceability",
      severity: item.severity === "WARNING" ? "MEDIUM" : item.severity,
      issue: item.title,
      evidence: item.detail,
      impact: "Traceability & Recall Intelligence — investigate missing or partial genealogy.",
      href: item.href,
    });
  }
  for (const item of qualityAttention) {
    managementAttention.push({
      id: item.id,
      domain: "Quality",
      severity: item.severity === "WARNING" ? "MEDIUM" : item.severity,
      issue: item.title,
      evidence: item.detail,
      impact: "Quality exception ownership, investigation, and corrective action required.",
      href: item.href,
    });
  }
  const rank: Record<ManagementAttentionItem["severity"], number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  managementAttention.sort((a, b) => rank[b.severity] - rank[a.severity] || a.id.localeCompare(b.id));

  const executiveKpis: ReportKpi[] = [
    {
      id: "revenue",
      label: "Revenue",
      value: sales.revenue,
      hint: sales.priorRevenueZero ? "vs prior 30 days: —" : sales.revenueGrowth,
      risk: "HEALTHY",
      href: "/reports?view=sales",
      available: !sales.empty,
    },
    {
      id: "orders",
      label: "Confirmed / fulfilled",
      value: formatCount(sales.orders),
      hint: sales.definition,
      risk: "HEALTHY",
      href: "/reports?view=sales",
      available: true,
    },
    {
      id: "ops",
      label: "Production status",
      value: `${formatCount(production.atRisk)} at risk`,
      hint: `${production.utilization} utilization`,
      risk: production.atRisk > 0 ? "HIGH" : "HEALTHY",
      href: "/operations",
      available: true,
    },
    {
      id: "inv-health",
      label: "Inventory health",
      value: formatCount(health.filter((row) => row.id !== "HEALTHY").reduce((sum, row) => sum + row.count, 0)),
      hint: "SKUs below healthy stock",
      risk: expiredQty > 0 ? "CRITICAL" : "HEALTHY",
      href: "/inventory",
      available: true,
    },
    {
      id: "mat-risk",
      label: "Material risk",
      value: formatCount(mrpShortages.length),
      hint: "Net requirement after available + incoming",
      risk: mrpShortages.length > 0 ? "CRITICAL" : "HEALTHY",
      href: "/materials",
      available: true,
    },
    {
      id: "proc-exposure",
      label: "Procurement exposure",
      value: approvedValueLabel,
      hint: `${formatCount(openQty)} units outstanding`,
      risk: openQty > 0 ? "MEDIUM" : "HEALTHY",
      href: "/purchase-orders",
      available: poMetrics?.approvedValue != null,
    },
    {
      id: "sup-perf",
      label: "Supplier performance",
      value: formatCount(supplierPerfMetrics?.attentionCount ?? 0),
      hint: "Watch / Risk bands",
      risk: (supplierPerfMetrics?.attentionCount ?? 0) > 0 ? "MEDIUM" : "HEALTHY",
      href: "/supplier-performance",
      available: true,
    },
  ];

  const supplierBands = [
    { id: "EXCELLENT", label: "Excellent", count: supplierPerfMetrics?.bands.EXCELLENT ?? 0 },
    { id: "STRONG", label: "Strong", count: supplierPerfMetrics?.bands.STRONG ?? 0 },
    { id: "WATCH", label: "Watch", count: supplierPerfMetrics?.bands.WATCH ?? 0 },
    { id: "RISK", label: "Risk", count: supplierPerfMetrics?.bands.RISK ?? 0 },
    { id: "INSUFFICIENT_DATA", label: "Insufficient data", count: supplierPerfMetrics?.bands.INSUFFICIENT_DATA ?? 0 },
  ];

  const procurementPipeline = [
    { id: "req", label: "Requisitions", count: procurementPlan?.pendingReviewCount ?? 0, href: "/procurement" },
    { id: "rfq", label: "RFQs", count: rfqMetrics?.total ?? 0, href: "/rfqs" },
    { id: "award", label: "Awards", count: rfqMetrics?.awarded ?? 0, href: "/rfqs?status=awarded" },
    { id: "po", label: "Purchase orders", count: (poMetrics?.draft ?? 0) + (poMetrics?.pendingApproval ?? 0) + (poMetrics?.approved ?? 0), href: "/purchase-orders" },
    { id: "rcv", label: "Receiving", count: (receivingMetrics?.awaiting ?? 0) + (receivingMetrics?.partial ?? 0), href: "/receiving" },
  ];

  return {
    brand: tenant?.name ?? "Workspace",
    disclaimer: tenant?.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: now.toISOString(),
    view: filters.view,
    kpis,
    findings: findings({
      expiredQty,
      expiredLots: expired,
      atRiskOrders: production.atRisk,
      shortMaterials,
      ageing: ageingBuckets,
      uncovered,
      mrpShortages: mrpShortages.length,
      mrpOrders: materialPlan?.orderIdsAtRisk.length ?? 0,
    }),
    historyNote:
      history.length >= 2
        ? from || to
          ? "Date range filters weekly inventory snapshots and current lots by received date. Lots are not time-travelled to historical on-hand."
          : "Inventory trend uses stored weekly snapshots. Set History from/to to also scope current lots by received date."
        : from || to
          ? "Historical trend unavailable — no weekly snapshots. Date range still scopes current lots by received date."
          : "Historical trend unavailable — no weekly inventory snapshots for this tenant.",
    history,
    lots: scoped,
    expiryBuckets,
    ageingBuckets,
    composition,
    concentration,
    highValue,
    warehouses: warehouses.map((row) => ({ id: row.id, name: row.name })),
    suppliers: depth.suppliers,
    categories: [...new Set(mapped.map((lot) => lot.category))].sort(),
    topExpiry,
    materials,
    materialPlan: {
      required: mrpRows.length,
      shortageQty: Math.round(mrpShortageQty),
      atRisk: mrpRows.filter((row) => row.risk !== "OK").length,
      ordersAffected: materialPlan?.orderIdsAtRisk.length ?? 0,
      incomingCoverage: Number.parseInt(incomingCoverageKpi, 10) || 0,
      concentration: topShortage
        ? {
            sku: topShortage.sku,
            title: topShortage.name,
            netRequirement: Math.round(topShortage.netRequirement),
            share: mrpShortageQty > 0 ? Math.round((topShortage.netRequirement / mrpShortageQty) * 100) : 0,
          }
        : null,
      procurementAttention: procurementPlan?.kpis.find((kpi) => kpi.id === "attention")?.value
        ? Number.parseInt(procurementPlan.kpis.find((kpi) => kpi.id === "attention")!.value.replace(/,/g, ""), 10) || 0
        : 0,
      criticalRequisitions: procurementPlan?.kpis.find((kpi) => kpi.id === "critical")?.value
        ? Number.parseInt(procurementPlan.kpis.find((kpi) => kpi.id === "critical")!.value.replace(/,/g, ""), 10) || 0
        : 0,
      pendingReview: procurementPlan?.pendingReviewCount ?? 0,
      requestedQuantity: procurementPlan?.rows.reduce((sum, row) => sum + row.suggestedQuantity, 0) ?? 0,
      supplierCoverage:
        supplierPlan?.kpis.find((kpi) => kpi.id === "coverage")?.value
          ? Number.parseInt(supplierPlan.kpis.find((kpi) => kpi.id === "coverage")!.value.replace("%", ""), 10) || 0
          : 0,
      preferredCoverage:
        supplierPlan?.rows.length
          ? Math.round((supplierPlan.rows.filter((row) => row.preferredMaterials > 0).length / supplierPlan.rows.length) * 100)
          : 0,
      leadTimeVisibility:
        supplierPlan?.rows.length
          ? Math.round((supplierPlan.rows.filter((row) => row.leadTimeCoverage > 0).length / supplierPlan.rows.length) * 100)
          : 0,
      pricingVisibility:
        supplierPlan?.rows.length
          ? Math.round((supplierPlan.rows.filter((row) => row.priceCoverage > 0).length / supplierPlan.rows.length) * 100)
          : 0,
      rfqTotal: rfqMetrics?.total ?? 0,
      rfqsAwaitingResponse: rfqMetrics?.awaitingResponse ?? 0,
      rfqsInEvaluation: rfqMetrics?.evaluation ?? 0,
      rfqsAwarded: rfqMetrics?.awarded ?? 0,
      rfqResponseCoverage: rfqMetrics?.responseCoverage ?? 0,
      rfqAverageLeadTimeDays: rfqMetrics?.averageLeadTimeDays ?? null,
      rfqQuotedValue: rfqMetrics?.quotedValue ?? null,
      rfqQuotedCurrency: rfqMetrics?.quotedCurrency ?? null,
      poDraft: poMetrics?.draft ?? 0,
      poPendingApproval: poMetrics?.pendingApproval ?? 0,
      poApproved: poMetrics?.approved ?? 0,
      poApprovedValue: poMetrics?.approvedValue ?? null,
      poApprovedCurrency: poMetrics?.approvedCurrency ?? null,
      receivingAwaiting: receivingMetrics?.awaiting ?? 0,
      receivingPartial: receivingMetrics?.partial ?? 0,
      receivingComplete: receivingMetrics?.complete ?? 0,
      receivingOutstandingQty: receivingMetrics?.outstandingQty ?? 0,
      receivingReceivedQty: receivingMetrics?.receivedQty ?? 0,
      receivingDiscrepancies: receivingMetrics?.discrepancyCount ?? 0,
      supplierPerfWithHistory: supplierPerfMetrics?.suppliersWithHistory ?? 0,
      supplierPerfCompletionRate: supplierPerfMetrics?.averageCompletionRate ?? null,
      supplierPerfDiscrepancyRate: supplierPerfMetrics?.discrepancyRate ?? null,
      supplierPerfConcentration: supplierPerfMetrics?.supplierConcentration ?? null,
      supplierPerfOpenExposure: supplierPerfMetrics?.openExposureSuppliers ?? 0,
      supplierPerfAttention: supplierPerfMetrics?.attentionCount ?? 0,
    },
    health,
    production,
    sales,
    executiveKpis,
    managementAttention,
    forecastOutlook,
    scenarioHref: "/scenarios",
    supplierBands,
    supplierAttention: supplierPerfMetrics?.topAttention ?? [],
    procurementPipeline,
    inboundReceipts: depth.receipts.map((row) => ({
      id: row.id,
      reference: row.reference,
      productName: row.productName,
      sku: row.sku,
      quantity: row.quantity,
      supplierName: row.supplierName,
      expectedAt: row.expectedAt.toISOString(),
      purchaseOrderId: row.purchaseOrderId,
      purchaseOrderNumber: row.purchaseOrderNumber,
    })),
    metricNotes: METRIC_CATALOG.slice(0, 8).map((row) => ({
      id: row.id,
      label: row.label,
      how: row.how,
    })),
    intelligence,
    scenarioPlanning: scenarioPlanning ?? undefined,
  };
}
