import { Prisma } from "@prisma/client";

import { formatRate, scoreSupplierPerformance } from "@/lib/supplier-performance/scoring";
import {
  SUPPLIER_PERFORMANCE_VIEWS,
  type CompactSupplierPerformanceContext,
  type PerformanceBand,
  type SupplierPerformanceCompareRow,
  type SupplierPerformanceDetail,
  type SupplierPerformanceRow,
  type SupplierPerformanceSnapshot,
  type SupplierPerformanceViewId,
} from "@/lib/supplier-performance/types";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";
import { formatCount } from "@/lib/server/money";
import { getTenant } from "@/lib/server/services/tenant";

export type SupplierPerformanceFilters = {
  view: SupplierPerformanceViewId;
  query?: string;
  materialId?: string;
  compareIds?: string[];
};

type BuiltRow = SupplierPerformanceRow & {
  orderedValue: Prisma.Decimal;
  receivedValue: Prisma.Decimal;
  discrepancyCount: number;
  receiptEventCount: number;
  outstandingQuantity: number;
  openPoExposure: Prisma.Decimal;
  currency: string | null;
};

function moneyLabel(value: Prisma.Decimal, currency: string | null): string {
  if (!currency) return "—";
  return `${currency} ${Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function resolveSupplierPerformanceFilters(input: {
  view?: string;
  q?: string;
  material?: string;
  compare?: string;
}): SupplierPerformanceFilters {
  const view = SUPPLIER_PERFORMANCE_VIEWS.includes(input.view as SupplierPerformanceViewId)
    ? (input.view as SupplierPerformanceViewId)
    : "all";
  return {
    view,
    query: input.q?.trim() || undefined,
    materialId: input.material?.trim() || undefined,
    compareIds: input.compare
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 3),
  };
}

async function buildRows(ctx: TenantContext, materialId?: string): Promise<{
  rows: BuiltRow[];
  materialLabel: string | null;
}> {
  const prisma = getPrisma();

  const material = materialId
    ? await prisma.product.findFirst({
        where: { id: materialId, tenantId: ctx.tenantId },
        select: { id: true, sku: true, name: true },
      })
    : null;
  if (materialId && !material) throw new ServerError("Material not found.", "NOT_FOUND");

  const supplierWhere: Prisma.SupplierWhereInput = { tenantId: ctx.tenantId };
  if (material) {
    supplierWhere.supplierMaterials = { some: { productId: material.id } };
  }

  const [suppliers, rfqSuppliers, awardedRfqs, purchaseOrders, receipts] = await Promise.all([
    prisma.supplier.findMany({
      where: supplierWhere,
      include: {
        supplierMaterials: {
          where: material ? { productId: material.id } : undefined,
          include: { product: { select: { id: true, sku: true, name: true } } },
        },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.procurementRfqSupplier.findMany({
      where: {
        supplier: { tenantId: ctx.tenantId },
        ...(material
          ? { rfq: { items: { some: { productId: material.id } } } }
          : {}),
      },
      include: {
        responses: { select: { id: true, responseStatus: true } },
        rfq: { select: { id: true, reference: true, status: true, awardedResponseId: true } },
      },
    }),
    prisma.procurementRfq.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "AWARDED",
        awardedResponseId: { not: null },
        ...(material ? { items: { some: { productId: material.id } } } : {}),
      },
      select: {
        id: true,
        awardedResponse: {
          select: {
            rfqSupplier: { select: { supplierId: true } },
          },
        },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(material ? { items: { some: { productId: material.id } } } : {}),
      },
      include: {
        items: {
          where: material ? { productId: material.id } : undefined,
          select: { quantity: true, receivedQuantity: true, unitPrice: true, lineTotal: true, currency: true },
        },
      },
    }),
    prisma.inventoryReceipt.findMany({
      where: {
        tenantId: ctx.tenantId,
        purchaseOrderId: { not: null },
        status: "RECEIVED",
        ...(material ? { productId: material.id } : {}),
      },
      select: {
        id: true,
        supplierId: true,
        purchaseOrderId: true,
        quantity: true,
        discrepancyReason: true,
        receivedAt: true,
        reference: true,
      },
    }),
  ]);

  const invitedBySupplier = new Map<string, typeof rfqSuppliers>();
  for (const row of rfqSuppliers) {
    const list = invitedBySupplier.get(row.supplierId) ?? [];
    list.push(row);
    invitedBySupplier.set(row.supplierId, list);
  }

  const awardsBySupplier = new Map<string, number>();
  for (const rfq of awardedRfqs) {
    const supplierId = rfq.awardedResponse?.rfqSupplier.supplierId;
    if (!supplierId) continue;
    awardsBySupplier.set(supplierId, (awardsBySupplier.get(supplierId) ?? 0) + 1);
  }

  const posBySupplier = new Map<string, typeof purchaseOrders>();
  for (const po of purchaseOrders) {
    const list = posBySupplier.get(po.supplierId) ?? [];
    list.push(po);
    posBySupplier.set(po.supplierId, list);
  }

  const receiptsBySupplier = new Map<string, typeof receipts>();
  for (const receipt of receipts) {
    if (!receipt.supplierId) continue;
    const list = receiptsBySupplier.get(receipt.supplierId) ?? [];
    list.push(receipt);
    receiptsBySupplier.set(receipt.supplierId, list);
  }

  const rows: BuiltRow[] = suppliers.map((supplier) => {
    const invitations = invitedBySupplier.get(supplier.id) ?? [];
    const rfqsInvited = invitations.length;
    const respondedCount = invitations.filter((row) =>
      row.responses.some((response) => response.responseStatus === "SUBMITTED" || response.responseStatus === "AWARDED")
    ).length;
    const rfqsAwarded = awardsBySupplier.get(supplier.id) ?? 0;

    const pos = posBySupplier.get(supplier.id) ?? [];
    let orderedQuantity = 0;
    let receivedQuantity = 0;
    let orderedValue = new Prisma.Decimal(0);
    let receivedValue = new Prisma.Decimal(0);
    const currencies = new Set<string>();

    for (const po of pos) {
      for (const item of po.items) {
        orderedQuantity += item.quantity;
        receivedQuantity += item.receivedQuantity;
        orderedValue = orderedValue.add(item.lineTotal);
        const unit = item.unitPrice;
        receivedValue = receivedValue.add(unit.mul(item.receivedQuantity));
        currencies.add(item.currency.trim());
      }
    }

    const currency = currencies.size === 1 ? [...currencies][0]! : null;
    const supplierReceipts = receiptsBySupplier.get(supplier.id) ?? [];
    const receiptEventCount = supplierReceipts.length;
    const discrepancyCount = supplierReceipts.filter((row) => Boolean(row.discrepancyReason)).length;
    const outstandingQuantity = Math.max(orderedQuantity - receivedQuantity, 0);

    const openPos = pos.filter((po) => po.status === "APPROVED" || po.status === "PENDING_APPROVAL");
    let openPoExposure = new Prisma.Decimal(0);
    for (const po of openPos) {
      for (const item of po.items) {
        const remaining = Math.max(item.quantity - item.receivedQuantity, 0);
        openPoExposure = openPoExposure.add(item.unitPrice.mul(remaining));
      }
    }

    const materials = supplier.supplierMaterials;
    const preferred = materials.some((row) => row.isPreferred);
    const leadTimes = materials.map((row) => row.leadTimeDays).filter((value): value is number => value !== null);
    const prices = materials.filter((row) => row.unitPrice !== null);
    const knownLeadTimeLabel =
      leadTimes.length === 0
        ? "—"
        : `${Math.round(leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length)}d known`;
    const knownPricingLabel =
      prices.length === 0
        ? "—"
        : prices.length === 1 && prices[0]!.currency
          ? `${prices[0]!.currency.trim()} ${Number(prices[0]!.unitPrice).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`
          : `${prices.length} known prices`;

    const scored = scoreSupplierPerformance({
      rfqsInvited,
      rfqsResponded: respondedCount,
      rfqsAwarded,
      poCount: pos.length,
      orderedQuantity,
      receivedQuantity,
      receiptEventCount,
      discrepancyEventCount: discrepancyCount,
      hasKnownPrice: prices.length > 0,
      hasKnownLeadTime: leadTimes.length > 0,
    });

    const attentionFlags: string[] = [];
    if (receiptEventCount > 0 && discrepancyCount / receiptEventCount >= 0.25) {
      attentionFlags.push("Receiving discrepancy rate is elevated");
    }
    if (orderedQuantity > 0 && receivedQuantity / orderedQuantity < 0.6) {
      attentionFlags.push("Completion rate is low relative to ordered quantity");
    }
    if (pos.some((po) => po.items.some((item) => item.receivedQuantity > 0 && item.receivedQuantity < item.quantity))) {
      attentionFlags.push("Repeated partial receipts on open lines");
    }
    if (Number(openPoExposure) > 0) {
      attentionFlags.push("Open PO exposure remains outstanding");
    }
    if (scored.band === "INSUFFICIENT_DATA") {
      attentionFlags.push("Limited receiving history");
    }
    if (prices.length === 0 && leadTimes.length === 0) {
      attentionFlags.push("Missing commercial data");
    }

    const hasHistory = rfqsInvited > 0 || pos.length > 0 || receiptEventCount > 0;

    return {
      supplierId: supplier.id,
      name: supplier.name,
      code: supplier.code,
      status: supplier.status as "ACTIVE" | "INACTIVE",
      rfqsInvited,
      rfqsResponded: respondedCount,
      rfqsAwarded,
      responseRateLabel: formatRate(respondedCount, rfqsInvited),
      poCount: pos.length,
      orderedValueLabel: moneyLabel(orderedValue, currency),
      receivedValueLabel: moneyLabel(receivedValue, currency),
      orderedQuantity,
      receivedQuantity,
      completionRateLabel: formatRate(receivedQuantity, orderedQuantity),
      discrepancyRateLabel: receiptEventCount === 0 ? "Insufficient data" : formatRate(discrepancyCount, receiptEventCount),
      averageReceivingDelayLabel: "Timing data unavailable",
      knownLeadTimeLabel,
      knownPricingLabel,
      preferred,
      confidence: scored.confidence,
      band: scored.band,
      scoreLabel: scored.score === null ? "—" : String(scored.score),
      insufficientReasons: scored.insufficientReasons,
      attentionFlags,
      hasHistory,
      orderedValue,
      receivedValue,
      discrepancyCount,
      receiptEventCount,
      outstandingQuantity,
      openPoExposure,
      currency,
    };
  });

  return {
    rows,
    materialLabel: material ? `${material.name} (${material.sku})` : null,
  };
}

function filterRows(rows: BuiltRow[], filters: SupplierPerformanceFilters): BuiltRow[] {
  let next = rows;
  if (filters.query) {
    const q = filters.query.toLowerCase();
    next = next.filter((row) => row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q));
  }
  switch (filters.view) {
    case "history":
      return next.filter((row) => row.hasHistory);
    case "attention":
      return next.filter((row) => row.attentionFlags.length > 0 && row.band !== "EXCELLENT" && row.band !== "STRONG");
    case "excellent":
      return next.filter((row) => row.band === "EXCELLENT" || row.band === "STRONG");
    case "risk":
      return next.filter((row) => row.band === "RISK" || row.band === "WATCH");
    case "insufficient":
      return next.filter((row) => row.band === "INSUFFICIENT_DATA");
    default:
      return next;
  }
}

export async function getSupplierPerformanceSnapshot(
  ctx: TenantContext,
  filters: SupplierPerformanceFilters
): Promise<SupplierPerformanceSnapshot> {
  const tenant = await getTenant(ctx);
  const { rows, materialLabel } = await buildRows(ctx, filters.materialId);
  const visible = filterRows(rows, filters);

  const withHistory = rows.filter((row) => row.hasHistory);
  const active = rows.filter((row) => row.status === "ACTIVE");
  const receiptEvents = rows.reduce((sum, row) => sum + row.receiptEventCount, 0);
  const discrepancyEvents = rows.reduce((sum, row) => sum + row.discrepancyCount, 0);
  const orderedQty = rows.reduce((sum, row) => sum + row.orderedQuantity, 0);
  const receivedQty = rows.reduce((sum, row) => sum + row.receivedQuantity, 0);
  const openExposure = rows.reduce((sum, row) => sum.add(row.openPoExposure), new Prisma.Decimal(0));
  const openCurrencies = new Set(rows.filter((row) => Number(row.openPoExposure) > 0).map((row) => row.currency).filter(Boolean));

  const attention = rows
    .filter((row) => row.attentionFlags.length > 0)
    .flatMap((row) =>
      row.attentionFlags.slice(0, 2).map((flag, index) => ({
        id: `${row.supplierId}-${index}`,
        supplierId: row.supplierId,
        supplierName: row.name,
        title: flag,
        evidence: row.insufficientReasons[0] ?? `${row.band.replaceAll("_", " ")} · confidence ${row.confidence}`,
        href: `/supplier-performance?supplier=${row.supplierId}`,
      }))
    )
    .slice(0, 12);

  const compareSource = filters.compareIds?.length
    ? rows.filter((row) => filters.compareIds!.includes(row.supplierId)).slice(0, 3)
    : [];

  const compare: SupplierPerformanceCompareRow[] = compareSource.map((row) => ({
    supplierId: row.supplierId,
    name: row.name,
    responseRateLabel: row.responseRateLabel,
    awards: row.rfqsAwarded,
    poCount: row.poCount,
    orderedValueLabel: row.orderedValueLabel,
    completionRateLabel: row.completionRateLabel,
    discrepancyRateLabel: row.discrepancyRateLabel,
    leadTimeLabel: row.knownLeadTimeLabel,
    pricingVisibilityLabel: row.knownPricingLabel === "—" ? "Price comparison unavailable" : row.knownPricingLabel,
    preferred: row.preferred,
    confidence: row.confidence,
    band: row.band,
  }));

  return {
    brand: tenant.name,
    disclaimer: tenant.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: new Date().toISOString(),
    view: filters.view,
    materialId: filters.materialId ?? null,
    materialLabel,
    planningNote:
      "Deterministic performance indicators from RFQs, purchase orders, and receipts. Timing/on-time metrics are shown only when actual delivery baselines exist.",
    kpis: [
      { id: "active", label: "Active suppliers", value: formatCount(active.length) },
      { id: "history", label: "Suppliers with history", value: formatCount(withHistory.length) },
      {
        id: "completion",
        label: "Complete receiving rate",
        value: orderedQty === 0 ? "Insufficient data" : formatRate(receivedQty, orderedQty),
      },
      {
        id: "discrepancy",
        label: "Receiving discrepancy rate",
        value: receiptEvents === 0 ? "Insufficient data" : formatRate(discrepancyEvents, receiptEvents),
      },
      {
        id: "exposure",
        label: "Open procurement exposure",
        value:
          Number(openExposure) <= 0
            ? "—"
            : openCurrencies.size === 1
              ? moneyLabel(openExposure, [...openCurrencies][0]!)
              : "Mixed currencies",
      },
    ],
    rows: visible.map(({ orderedValue: _o, receivedValue: _r, openPoExposure: _e, currency: _c, discrepancyCount: _d, receiptEventCount: _re, outstandingQuantity: _oq, ...row }) => row),
    attention,
    compare,
    emptyReason: visible.length === 0 ? "No suppliers match the current filters." : null,
  };
}

export async function getSupplierPerformanceDetail(ctx: TenantContext, supplierId: string): Promise<SupplierPerformanceDetail> {
  const prisma = getPrisma();
  const { rows } = await buildRows(ctx);
  const row = rows.find((item) => item.supplierId === supplierId);
  if (!row) throw new ServerError("Supplier not found.", "NOT_FOUND");

  const [materials, rfqLinks, pos, receipts] = await Promise.all([
    prisma.supplierMaterial.findMany({
      where: { tenantId: ctx.tenantId, supplierId },
      include: { product: { select: { id: true, sku: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.procurementRfqSupplier.findMany({
      where: { supplierId, supplier: { tenantId: ctx.tenantId } },
      include: { rfq: { select: { id: true, reference: true, status: true, title: true, createdAt: true } } },
      take: 20,
    }),
    prisma.purchaseOrder.findMany({
      where: { tenantId: ctx.tenantId, supplierId },
      select: { id: true, poNumber: true, status: true, subtotal: true, currency: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.inventoryReceipt.findMany({
      where: { tenantId: ctx.tenantId, supplierId, status: "RECEIVED", purchaseOrderId: { not: null } },
      select: { id: true, reference: true, quantity: true, discrepancyReason: true, purchaseOrderId: true, receivedAt: true },
      orderBy: { receivedAt: "desc" },
      take: 12,
    }),
  ]);

  return {
    supplierId: row.supplierId,
    name: row.name,
    code: row.code,
    status: row.status,
    band: row.band,
    confidence: row.confidence,
    scoreLabel: row.scoreLabel,
    insufficientReasons: row.insufficientReasons,
    attentionFlags: row.attentionFlags,
    metrics: {
      rfqsInvited: row.rfqsInvited,
      rfqsResponded: row.rfqsResponded,
      rfqsAwarded: row.rfqsAwarded,
      responseRateLabel: row.responseRateLabel,
      poCount: row.poCount,
      orderedValueLabel: row.orderedValueLabel,
      receivedValueLabel: row.receivedValueLabel,
      orderedQuantity: row.orderedQuantity,
      receivedQuantity: row.receivedQuantity,
      completionRateLabel: row.completionRateLabel,
      discrepancyCount: row.discrepancyCount,
      discrepancyRateLabel: row.discrepancyRateLabel,
      outstandingQuantity: row.outstandingQuantity,
      averageReceivingDelayLabel: row.averageReceivingDelayLabel,
      preferred: row.preferred,
      knownLeadTimeLabel: row.knownLeadTimeLabel,
      knownPricingLabel: row.knownPricingLabel,
      priceVisibilityLabel: row.knownPricingLabel === "—" ? "Price comparison unavailable" : "Known pricing present",
    },
    materials: materials.map((item) => ({
      productId: item.productId,
      sku: item.product.sku,
      name: item.product.name,
      preferred: item.isPreferred,
      leadTimeDays: item.leadTimeDays,
      unitPriceLabel: item.unitPrice
        ? `${item.currency?.trim() ?? "—"} ${Number(item.unitPrice).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`
        : "—",
    })),
    rfqHistory: [...rfqLinks]
      .sort((a, b) => b.rfq.createdAt.getTime() - a.rfq.createdAt.getTime())
      .slice(0, 12)
      .map((link) => ({
        id: link.rfq.id,
        label: link.rfq.reference,
        href: `/rfqs/${link.rfq.id}`,
        meta: `${link.rfq.status} · ${link.rfq.title}`,
      })),
    poHistory: pos.map((po) => ({
      id: po.id,
      label: po.poNumber,
      href: `/purchase-orders/${po.id}`,
      meta: `${po.status} · ${moneyLabel(po.subtotal, po.currency.trim())}`,
    })),
    receivingHistory: receipts.map((receipt) => ({
      id: receipt.id,
      label: receipt.reference,
      href: receipt.purchaseOrderId ? `/receiving/${receipt.purchaseOrderId}` : "/receiving",
      meta: `${receipt.quantity.toLocaleString("en-KE")} units${receipt.discrepancyReason ? " · discrepancy" : ""}`,
    })),
    discrepancies: receipts
      .filter((receipt) => Boolean(receipt.discrepancyReason))
      .map((receipt) => ({
        id: receipt.id,
        label: receipt.reference,
        reason: receipt.discrepancyReason ?? "Discrepancy detected",
        href: receipt.purchaseOrderId ? `/receiving/${receipt.purchaseOrderId}` : "/receiving",
      })),
  };
}

export async function getSupplierPerformanceReportMetrics(ctx: TenantContext) {
  const { rows } = await buildRows(ctx);
  const withHistory = rows.filter((row) => row.hasHistory);
  const receiptEvents = rows.reduce((sum, row) => sum + row.receiptEventCount, 0);
  const discrepancyEvents = rows.reduce((sum, row) => sum + row.discrepancyCount, 0);
  const orderedQty = rows.reduce((sum, row) => sum + row.orderedQuantity, 0);
  const receivedQty = rows.reduce((sum, row) => sum + row.receivedQuantity, 0);
  const openExposureSuppliers = rows.filter((row) => Number(row.openPoExposure) > 0).length;
  const totalOrderedValue = rows.reduce((sum, row) => sum.add(row.orderedValue), new Prisma.Decimal(0));
  const topShare =
    rows.length === 0 || Number(totalOrderedValue) <= 0
      ? null
      : Math.round(
          (Number([...rows].sort((a, b) => Number(b.orderedValue) - Number(a.orderedValue))[0]!.orderedValue) / Number(totalOrderedValue)) *
            100
        );

  return {
    supplierCount: rows.length,
    suppliersWithHistory: withHistory.length,
    averageCompletionRate: orderedQty === 0 ? null : Math.round(Math.min(1, receivedQty / orderedQty) * 100),
    discrepancyRate: receiptEvents === 0 ? null : Math.round((discrepancyEvents / receiptEvents) * 100),
    supplierConcentration: topShare,
    openExposureSuppliers,
    attentionCount: rows.filter((row) => row.band === "RISK" || row.band === "WATCH").length,
    bands: {
      EXCELLENT: rows.filter((row) => row.band === "EXCELLENT").length,
      STRONG: rows.filter((row) => row.band === "STRONG").length,
      WATCH: rows.filter((row) => row.band === "WATCH").length,
      RISK: rows.filter((row) => row.band === "RISK").length,
      INSUFFICIENT_DATA: rows.filter((row) => row.band === "INSUFFICIENT_DATA").length,
    },
    topAttention: rows
      .filter((row) => row.band === "RISK" || row.band === "WATCH")
      .slice(0, 5)
      .map((row) => ({ id: row.supplierId, name: row.name, band: row.band, reason: row.attentionFlags[0] ?? row.band })),
  };
}

export async function countSupplierPerformanceAttention(ctx: TenantContext): Promise<number> {
  const metrics = await getSupplierPerformanceReportMetrics(ctx);
  return metrics.attentionCount;
}

export function toCompactSupplierPerformanceContext(
  snapshot: SupplierPerformanceSnapshot
): CompactSupplierPerformanceContext {
  const history = snapshot.rows.filter((row) => row.hasHistory);
  const top = [...history]
    .filter((row) => row.band === "EXCELLENT" || row.band === "STRONG")
    .slice(0, 3)
    .map((row) => ({ name: row.name, band: row.band, completionRate: row.completionRateLabel }));
  const attention = snapshot.attention.slice(0, 5).map((row) => ({ name: row.supplierName, reason: row.title }));
  const completion = snapshot.kpis.find((kpi) => kpi.id === "completion")?.value ?? "Insufficient data";
  const discrepancy = snapshot.kpis.find((kpi) => kpi.id === "discrepancy")?.value ?? "Insufficient data";
  const exposure = snapshot.kpis.find((kpi) => kpi.id === "exposure")?.value ?? "—";
  const confidenceCounts = history.reduce(
    (acc, row) => {
      acc[row.confidence] += 1;
      return acc;
    },
    { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 }
  );

  return {
    supplierCount: snapshot.rows.length,
    suppliersWithHistory: history.length,
    topPerformers: top,
    attentionSuppliers: attention,
    completionRate: completion,
    discrepancyRate: discrepancy,
    openExposure: exposure,
    confidence: `HIGH ${confidenceCounts.HIGH} · MEDIUM ${confidenceCounts.MEDIUM} · LOW ${confidenceCounts.LOW}`,
    materialFilter: snapshot.materialLabel,
  };
}

export type { PerformanceBand };
