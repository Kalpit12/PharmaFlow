import { Prisma } from "@prisma/client";

import {
  AGEING_BUCKETS,
  INVENTORY_EXPIRY_BUCKETS,
  ageingRisk,
  batchExpiryStatus,
  expiryRisk,
  inventoryHealth,
  inventoryHealthRisk,
  matchBucket,
  sharePercent,
  wholeDays,
  type InventoryHealth,
  type ReportRisk,
  type TimeBucket,
} from "@/lib/reports/risk";
import {
  INVENTORY_VIEWS,
  type InventoryCategoryRow,
  type InventoryItem,
  type InventoryKpi,
  type InventorySnapshot,
  type InventoryViewId,
} from "@/lib/inventory/types";
import type { BucketRow, InventoryClassId } from "@/lib/reports/types";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { formatCount } from "@/lib/server/money";

export type InventoryFilters = {
  view: InventoryViewId;
  classId?: InventoryClassId;
  status?: InventoryHealth;
  query?: string;
  bucket?: string;
};

const CLASS_LABEL: Record<InventoryClassId, string> = {
  FINISHED_GOOD: "Finished goods",
  RAW_MATERIAL: "Raw materials",
  PACKAGING: "Packaging",
};

function parseView(value?: string): InventoryViewId {
  return INVENTORY_VIEWS.includes(value as InventoryViewId) ? (value as InventoryViewId) : "overview";
}

export function resolveInventoryFilters(input: {
  view?: string;
  class?: string;
  status?: string;
  q?: string;
  bucket?: string;
}): InventoryFilters {
  const classId =
    input.class === "FINISHED_GOOD" || input.class === "RAW_MATERIAL" || input.class === "PACKAGING"
      ? input.class
      : undefined;
  const status =
    input.status === "HEALTHY" || input.status === "LOW" || input.status === "CRITICAL" || input.status === "OUT_OF_STOCK"
      ? input.status
      : undefined;
  return {
    view: parseView(input.view),
    classId,
    status,
    query: input.q?.trim() || undefined,
    bucket: input.bucket || undefined,
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

function bucketTotals(
  rows: Array<{ quantity: number; bucket: string | null; risk: ReportRisk | null }>,
  buckets: TimeBucket[]
): BucketRow[] {
  const dated = rows.filter((row) => row.bucket);
  const total = dated.reduce((sum, row) => sum + row.quantity, 0);
  return buckets.map((bucket) => {
    const match = dated.filter((row) => row.bucket === bucket.id);
    const quantity = match.reduce((sum, row) => sum + row.quantity, 0);
    const risks = match.map((row) => row.risk).filter(Boolean) as ReportRisk[];
    const risk: ReportRisk = risks.includes("CRITICAL")
      ? "CRITICAL"
      : risks.includes("HIGH")
        ? "HIGH"
        : risks.includes("MEDIUM")
          ? "MEDIUM"
          : quantity > 0
            ? "LOW"
            : "HEALTHY";
    return { id: bucket.id, label: bucket.label, quantity, share: sharePercent(quantity, total), items: match.length, risk };
  });
}

export async function getInventorySnapshot(ctx: TenantContext, filters: InventoryFilters): Promise<InventorySnapshot> {
  const prisma = getPrisma();
  const now = new Date();
  const [tenant, lots, receipts, boms, orders] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, status: true } }),
    prisma.$queryRaw<
      Array<{
        id: string;
        productId: string;
        sku: string;
        name: string;
        unit: string | null;
        category: string;
        safetyStock: number;
        class: InventoryClassId;
        batchCode: string;
        quantity: number;
        receivedAt: Date;
        expiryDate: Date | null;
        warehouseName: string;
        supplierName: string | null;
      }>
    >(Prisma.sql`
      SELECT
        l.id,
        l."productId",
        p.sku,
        p.name,
        p.unit,
        p.category,
        p."safetyStock",
        l.class,
        l."batchCode",
        l.quantity,
        l."receivedAt",
        l."expiryDate",
        w.name AS "warehouseName",
        s.name AS "supplierName"
      FROM "InventoryLot" l
      INNER JOIN "Product" p ON p.id = l."productId"
      INNER JOIN "Warehouse" w ON w.id = l."warehouseId"
      LEFT JOIN "Supplier" s ON s.id = l."supplierId"
      WHERE l."tenantId" = ${ctx.tenantId}
      ORDER BY p.sku ASC, l."batchCode" ASC
    `),
    prisma.$queryRaw<Array<{ productId: string; sku: string; quantity: number }>>(Prisma.sql`
      SELECT r."productId", p.sku, r.quantity
      FROM "InventoryReceipt" r
      INNER JOIN "Product" p ON p.id = r."productId"
      WHERE r."tenantId" = ${ctx.tenantId} AND r.status = 'OPEN'
    `).catch(() => [] as Array<{ productId: string; sku: string; quantity: number }>),
    prisma.$queryRaw<Array<{ productId: string; componentId: string; quantityPer: Prisma.Decimal }>>(Prisma.sql`
      SELECT "productId", "componentId", "quantityPer" FROM "BillOfMaterial" WHERE "tenantId" = ${ctx.tenantId}
    `).catch(() => [] as Array<{ productId: string; componentId: string; quantityPer: Prisma.Decimal }>),
    prisma.productionOrder
      .findMany({
        where: { tenantId: ctx.tenantId, status: { not: "COMPLETED" } },
        select: {
          id: true,
          productId: true,
          orderNumber: true,
          quantity: true,
          status: true,
          workstation: { select: { name: true } },
        },
      })
      .catch(() => []),
  ]);

  const incoming = new Map<string, number>();
  for (const row of receipts) incoming.set(row.productId, (incoming.get(row.productId) ?? 0) + row.quantity);

  const needByComponent = new Map<string, number>();
  for (const order of orders) {
    for (const line of boms.filter((bom) => bom.productId === order.productId)) {
      const qty = Number(asMoney(line.quantityPer).mul(order.quantity).toDecimalPlaces(3).toString());
      needByComponent.set(line.componentId, (needByComponent.get(line.componentId) ?? 0) + qty);
    }
  }

  const grouped = new Map<string, InventoryItem>();
  for (const lot of lots) {
    const receivedAt = asDate(lot.receivedAt) ?? now;
    const expiryDate = asDate(lot.expiryDate);
    const ageDays = Math.max(0, wholeDays(receivedAt, now));
    const daysRemaining = expiryDate ? wholeDays(now, expiryDate) : null;
    const item = grouped.get(lot.productId) ?? {
      id: lot.productId,
      sku: lot.sku,
      name: lot.name,
      unit: lot.unit || "unit",
      category: lot.category,
      classId: lot.class,
      onHand: 0,
      safetyStock: lot.safetyStock,
      inTransit: incoming.get(lot.productId) ?? 0,
      available: 0,
      projected: 0,
      required: lot.safetyStock,
      shortfall: 0,
      productionNeed: Math.round(needByComponent.get(lot.productId) ?? 0),
      hasBom: needByComponent.has(lot.productId),
      health: "HEALTHY",
      nearestExpiry: null,
      daysRemaining: null,
      batchCount: 0,
      suppliers: [],
      orders: [],
      batches: [],
    };
    item.onHand += lot.quantity;
    item.batchCount += 1;
    if (lot.supplierName && !item.suppliers.includes(lot.supplierName)) item.suppliers.push(lot.supplierName);
    if (daysRemaining !== null && (item.daysRemaining === null || daysRemaining < item.daysRemaining)) {
      item.daysRemaining = daysRemaining;
      item.nearestExpiry = expiryDate?.toISOString() ?? null;
    }
    item.batches.push({
      id: lot.id,
      batchCode: lot.batchCode,
      quantity: lot.quantity,
      receivedAt: receivedAt.toISOString(),
      expiryDate: expiryDate?.toISOString() ?? null,
      daysRemaining,
      ageDays,
      expiryBucket: daysRemaining === null ? null : matchBucket(daysRemaining, INVENTORY_EXPIRY_BUCKETS).id,
      ageingBucket: matchBucket(ageDays, AGEING_BUCKETS).id,
      expiryStatus: batchExpiryStatus(daysRemaining),
      warehouseName: lot.warehouseName,
      supplierName: lot.supplierName,
    });
    grouped.set(lot.productId, item);
  }

  for (const item of grouped.values()) {
    item.available = item.onHand;
    item.projected = item.onHand + item.inTransit;
    item.required = Math.max(item.safetyStock, item.productionNeed);
    item.shortfall = Math.max(item.required - item.projected, 0);
    item.health = inventoryHealth(item.onHand, item.safetyStock);
    item.orders = orders
      .filter((order) => order.productId === item.id)
      .map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        quantity: order.quantity,
        status: order.status,
        workstationName: order.workstation?.name ?? null,
      }));
  }

  const all = [...grouped.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  const items = all.filter((item) => {
    if (filters.classId && item.classId !== filters.classId) return false;
    if (filters.status && item.health !== filters.status) return false;
    if (filters.query) {
      const q = filters.query.toLowerCase();
      const batchHit = item.batches.some((batch) => batch.batchCode.toLowerCase().includes(q));
      if (![item.sku, item.name, ...item.suppliers].some((value) => value.toLowerCase().includes(q)) && !batchHit) {
        return false;
      }
    }
    if (filters.bucket) {
      if (filters.view === "ageing" && !item.batches.some((batch) => batch.ageingBucket === filters.bucket)) return false;
      if (filters.view !== "ageing" && !item.batches.some((batch) => batch.expiryBucket === filters.bucket)) return false;
    }
    return true;
  });

  const scopedBatches = items.flatMap((item) => item.batches);
  const expiryRows = scopedBatches.map((batch) => ({
    quantity: batch.quantity,
    bucket: batch.expiryBucket,
    risk: batch.daysRemaining === null ? null : expiryRisk(batch.daysRemaining),
  }));
  const ageingRows = scopedBatches.map((batch) => ({
    quantity: batch.quantity,
    bucket: batch.ageingBucket,
    risk: ageingRisk(batch.ageDays),
  }));

  const expiredBatches = scopedBatches.filter((batch) => batch.expiryStatus === "EXPIRED");
  const soonBatches = scopedBatches.filter((batch) => batch.expiryStatus === "EXPIRING_SOON");
  const expiredQty = expiredBatches.reduce((sum, batch) => sum + batch.quantity, 0);
  const expiringSoonQty = soonBatches.reduce((sum, batch) => sum + batch.quantity, 0);
  const stockQty = items.reduce((sum, item) => sum + item.onHand, 0);
  const transitQty = items.reduce((sum, item) => sum + item.inTransit, 0);

  const healthIds: InventoryHealth[] = ["HEALTHY", "LOW", "CRITICAL", "OUT_OF_STOCK"];
  const health = healthIds.map((id) => {
    const rows = items.filter((item) => item.health === id);
    return {
      id,
      label: id.replace(/_/g, " "),
      count: rows.length,
      quantity: rows.reduce((sum, item) => sum + item.onHand, 0),
    };
  });

  const categories: InventoryCategoryRow[] = (["FINISHED_GOOD", "RAW_MATERIAL", "PACKAGING"] as InventoryClassId[]).map((id) => {
    const rows = items.filter((item) => item.classId === id);
    return {
      id,
      label: CLASS_LABEL[id],
      items: rows.length,
      quantity: rows.reduce((sum, item) => sum + item.onHand, 0),
      low: rows.filter((item) => item.health === "LOW").length,
      critical: rows.filter((item) => item.health === "CRITICAL" || item.health === "OUT_OF_STOCK").length,
      expiryRisk: rows.filter((item) => item.daysRemaining !== null && item.daysRemaining <= 30).length,
    };
  });

  const low = items.filter((item) => item.health === "LOW" || item.health === "CRITICAL").length;
  const out = items.filter((item) => item.health === "OUT_OF_STOCK").length;
  const findings: string[] = [];
  if (expiredQty > 0) findings.push(`${formatCount(expiredQty)} units are expired across ${expiredBatches.length} batches.`);
  if (out > 0) findings.push(`${out} item${out === 1 ? " is" : "s are"} out of stock.`);
  if (low > 0) findings.push(`${low} item${low === 1 ? " is" : "s are"} at or below safety stock.`);
  if (transitQty > 0) findings.push(`${formatCount(transitQty)} units are open inbound (goods in transit).`);
  if (findings.length === 0) findings.push("Nothing requires immediate attention.");

  const kpis: InventoryKpi[] = [
    { id: "stock", label: "Total stock", value: formatCount(stockQty), hint: `${items.length} items`, risk: "HEALTHY" as ReportRisk, href: "/inventory" },
    {
      id: "low",
      label: "Low stock",
      value: formatCount(low),
      hint: "At or below safety stock",
      risk: inventoryHealthRisk(low > 0 ? "LOW" : "HEALTHY"),
      href: "/inventory?view=health&status=LOW",
    },
    {
      id: "out",
      label: "Out of stock",
      value: formatCount(out),
      hint: "Zero on hand",
      risk: inventoryHealthRisk(out > 0 ? "OUT_OF_STOCK" : "HEALTHY"),
      href: "/inventory?view=health&status=OUT_OF_STOCK",
    },
    {
      id: "soon",
      label: "Expiring soon",
      value: formatCount(expiringSoonQty),
      hint: "0–30 days",
      risk: expiringSoonQty > 0 ? "HIGH" : "HEALTHY",
      href: "/inventory?view=expiry&bucket=0-30",
    },
    {
      id: "expired",
      label: "Expired",
      value: formatCount(expiredQty),
      hint: `${expiredBatches.length} batches`,
      risk: expiredQty > 0 ? "CRITICAL" : "HEALTHY",
      href: "/inventory?view=expiry&bucket=expired",
    },
    {
      id: "transit",
      label: "In transit",
      value: formatCount(transitQty),
      hint: "Open inbound receipts",
      risk: "HEALTHY",
      href: "/inventory?view=requirements",
    },
  ];

  return {
    brand: tenant?.name ?? "Workspace",
    disclaimer: tenant?.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: now.toISOString(),
    view: filters.view,
    kpis,
    findings,
    health,
    categories,
    expiryBuckets: bucketTotals(expiryRows, INVENTORY_EXPIRY_BUCKETS),
    ageingBuckets: bucketTotals(ageingRows, AGEING_BUCKETS),
    items,
    expiredQty,
    expiringSoonQty,
    expiredShare: sharePercent(expiredQty + expiringSoonQty, stockQty),
    expiredItems: items.filter((item) => item.batches.some((batch) => batch.expiryStatus === "EXPIRED")).length,
    expiredBatches: expiredBatches.length,
  };
}
