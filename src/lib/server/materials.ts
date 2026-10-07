import { Prisma } from "@prisma/client";

import {
  computeMaterialRequirements,
  isOpenProductionStatus,
  orderIdsAtMaterialRisk,
} from "@/lib/materials/requirements";
import { buildShortageHorizon } from "@/lib/materials/shortages";
import {
  MATERIAL_RISKS,
  MATERIAL_VIEWS,
  type MaterialRisk,
  type MaterialViewId,
  type MaterialsSnapshot,
  type ProcurementLinkage,
  type ProductionPriorityId,
} from "@/lib/materials/types";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { formatCount } from "@/lib/server/money";

export type MaterialsFilters = {
  view: MaterialViewId;
  risk?: MaterialRisk;
  orderId?: string;
  query?: string;
  materialId?: string;
};

function parseView(value?: string): MaterialViewId {
  return MATERIAL_VIEWS.includes(value as MaterialViewId) ? (value as MaterialViewId) : "requirements";
}

function parseRisk(value?: string): MaterialRisk | undefined {
  return MATERIAL_RISKS.includes(value as MaterialRisk) ? (value as MaterialRisk) : undefined;
}

export function resolveMaterialsFilters(input: {
  view?: string;
  risk?: string;
  order?: string;
  q?: string;
  material?: string;
}): MaterialsFilters {
  return {
    view: parseView(input.view),
    risk: parseRisk(input.risk),
    orderId: input.order?.trim() || undefined,
    query: input.q?.trim() || undefined,
    materialId: input.material?.trim() || undefined,
  };
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asQty(value: Prisma.Decimal | string | number | null | undefined): number {
  if (value instanceof Prisma.Decimal) return Number(value.toDecimalPlaces(6).toString());
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asIso(value: Date | string | null | undefined): string | null {
  const date = asDate(value);
  return date ? date.toISOString() : null;
}

function asPriority(value: string): ProductionPriorityId {
  if (value === "LOW" || value === "HIGH" || value === "CRITICAL") return value;
  return "NORMAL";
}

function buildProcurementMap(
  productIds: string[],
  requisitions: Array<{ productId: string; count: number }>,
  rfqs: Array<{ productId: string; count: number }>,
  purchaseOrders: Array<{ productId: string; count: number }>
): Map<string, ProcurementLinkage> {
  const reqByProduct = new Map(requisitions.map((row) => [row.productId, row.count]));
  const rfqByProduct = new Map(rfqs.map((row) => [row.productId, row.count]));
  const poByProduct = new Map(purchaseOrders.map((row) => [row.productId, row.count]));
  const map = new Map<string, ProcurementLinkage>();
  for (const productId of productIds) {
    map.set(productId, {
      openRequisitions: reqByProduct.get(productId) ?? 0,
      openRfqs: rfqByProduct.get(productId) ?? 0,
      openPurchaseOrders: poByProduct.get(productId) ?? 0,
      hrefProcurement: `/procurement?material=${productId}`,
      hrefRfqs: `/rfqs?material=${productId}`,
      hrefPurchaseOrders: `/purchase-orders?material=${productId}`,
    });
  }
  return map;
}

export async function getMaterialsSnapshot(ctx: TenantContext, filters: MaterialsFilters): Promise<MaterialsSnapshot> {
  const prisma = getPrisma();
  const now = new Date();
  const [tenant, products, lots, receipts, boms, orders, requisitions, procurementRfqs, purchaseOrders] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, status: true } }),
    prisma.$queryRaw<Array<{ id: string; sku: string; name: string; unit: string | null; safetyStock: number }>>(Prisma.sql`
      SELECT id, sku, name, unit, "safetyStock" FROM "Product" WHERE "tenantId" = ${ctx.tenantId}
    `),
    prisma.$queryRaw<
      Array<{ productId: string; batchCode: string; quantity: number; expiryDate: Date | null; warehouseName: string }>
    >(Prisma.sql`
      SELECT l."productId", l."batchCode", l.quantity, l."expiryDate", w.name AS "warehouseName"
      FROM "InventoryLot" l
      INNER JOIN "Warehouse" w ON w.id = l."warehouseId"
      WHERE l."tenantId" = ${ctx.tenantId}
    `),
    prisma.$queryRaw<Array<{ productId: string; quantity: number; expectedAt: Date | null }>>(Prisma.sql`
      SELECT r."productId", r.quantity, r."expectedAt"
      FROM "InventoryReceipt" r
      WHERE r."tenantId" = ${ctx.tenantId} AND r.status = 'OPEN'
    `).catch(() => [] as Array<{ productId: string; quantity: number; expectedAt: Date | null }>),
    prisma.$queryRaw<Array<{ productId: string; componentId: string; quantityPer: Prisma.Decimal }>>(Prisma.sql`
      SELECT "productId", "componentId", "quantityPer" FROM "BillOfMaterial" WHERE "tenantId" = ${ctx.tenantId}
    `).catch(() => [] as Array<{ productId: string; componentId: string; quantityPer: Prisma.Decimal }>),
    prisma.$queryRaw<
      Array<{
        id: string;
        orderNumber: string;
        productId: string;
        productName: string;
        quantity: number;
        dueDate: Date;
        priority: string;
        status: string;
        plannedStart: Date | null;
        plannedEnd: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        o.id,
        o."orderNumber",
        o."productId",
        p.name AS "productName",
        o.quantity,
        o."dueDate",
        o.priority,
        o.status,
        o."plannedStart",
        o."plannedEnd"
      FROM "ProductionOrder" o
      INNER JOIN "Product" p ON p.id = o."productId"
      WHERE o."tenantId" = ${ctx.tenantId} AND o.status <> 'COMPLETED'
    `).catch(() => []),
    prisma.$queryRaw<Array<{ productId: string; count: number }>>(Prisma.sql`
      SELECT "productId", COUNT(*)::int AS count
      FROM "ProcurementRequisition"
      WHERE "tenantId" = ${ctx.tenantId} AND status <> 'REJECTED'
      GROUP BY "productId"
    `).catch(() => []),
    prisma.$queryRaw<Array<{ productId: string; count: number }>>(Prisma.sql`
      SELECT i."productId", COUNT(DISTINCT r.id)::int AS count
      FROM procurement_rfq_items i
      INNER JOIN "ProcurementRfq" r ON r.id = i."rfqId"
      WHERE r."tenantId" = ${ctx.tenantId}
        AND r.status NOT IN ('CLOSED', 'CANCELLED', 'AWARDED')
      GROUP BY i."productId"
    `).catch(() => []),
    prisma.$queryRaw<Array<{ productId: string; count: number }>>(Prisma.sql`
      SELECT i."productId", COUNT(DISTINCT p.id)::int AS count
      FROM purchase_order_items i
      INNER JOIN "purchase_orders" p ON p.id = i."purchaseOrderId"
      WHERE p."tenantId" = ${ctx.tenantId}
        AND p.status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED')
      GROUP BY i."productId"
    `).catch(() => []),
  ]);

  const productIds = products.map((product) => product.id);
  const procurementByProduct = buildProcurementMap(productIds, requisitions, procurementRfqs, purchaseOrders);

  const bomCycles: Array<{ orderId: string; orderNumber: string; path: string[] }> = [];
  const allRows = computeMaterialRequirements({
    orders: orders
      .filter((order) => isOpenProductionStatus(order.status))
      .map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        productId: order.productId,
        productName: order.productName,
        quantity: order.quantity,
        dueDate: asIso(order.dueDate) ?? now.toISOString(),
        priority: asPriority(order.priority),
        status: order.status,
        plannedStart: asIso(order.plannedStart),
        plannedEnd: asIso(order.plannedEnd),
      })),
    boms: boms.map((line) => ({
      productId: line.productId,
      componentId: line.componentId,
      quantityPer: asQty(line.quantityPer),
    })),
    identities: products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit || "unit",
      safetyStock: product.safetyStock,
    })),
    lots: lots.map((lot) => ({
      productId: lot.productId,
      batchCode: lot.batchCode,
      quantity: lot.quantity,
      expiryDate: asIso(lot.expiryDate),
      warehouseName: lot.warehouseName,
    })),
    receipts: receipts.map((row) => ({
      productId: row.productId,
      quantity: row.quantity,
      expectedAt: asIso(row.expectedAt),
    })),
    procurementByProduct,
    now,
    bomCycles,
  });

  const query = filters.query?.toLowerCase();
  const materials = allRows.filter((row) => {
    if (filters.risk && row.risk !== filters.risk) return false;
    if (filters.orderId && !row.affectedOrders.some((order) => order.id === filters.orderId)) return false;
    if (query && !row.sku.toLowerCase().includes(query) && !row.name.toLowerCase().includes(query)) return false;
    if (filters.view === "shortages" && !row.shortage) return false;
    if (filters.view === "procurement" && !row.attention) return false;
    return true;
  });

  const shortages = allRows.filter((row) => row.shortage);
  const atRisk = allRows.filter((row) => row.shortageStatus === "AT_RISK" || row.shortageStatus === "SHORTAGE");
  const criticalShortages = allRows.filter((row) => row.priorityLevel === "CRITICAL");
  const orderIdsAtRisk = orderIdsAtMaterialRisk(allRows);
  const totalGross = allRows.reduce((sum, row) => sum + row.grossRequirement, 0);
  const totalIncoming = allRows.reduce((sum, row) => sum + row.incoming, 0);
  const inboundAgainstGross = allRows.reduce((sum, row) => sum + Math.min(row.incoming, row.grossRequirement), 0);
  const incomingCoverage = totalGross > 0 ? Math.round((inboundAgainstGross / totalGross) * 100) : 0;
  const shortageHorizon = buildShortageHorizon(allRows);

  let emptyReason: string | null = null;
  if (boms.length === 0) {
    emptyReason = "No bills of material are recorded for this workspace. Add BOM lines to see material requirements.";
  } else if (orders.length === 0) {
    emptyReason = "No open production orders are in scope. Scheduled, planned, released, or in-progress orders drive demand.";
  } else if (allRows.length === 0 && bomCycles.length > 0) {
    emptyReason = "A circular bill of material blocked demand explosion. Demand for those orders was not calculated.";
  } else if (allRows.length === 0) {
    emptyReason = "Open production orders do not match any bill of material lines, so there is no material demand to plan.";
  } else if (materials.length === 0 && filters.view === "shortages") {
    emptyReason = "No confirmed material shortages for open production.";
  } else if (materials.length === 0 && filters.view === "procurement") {
    emptyReason = "No materials currently require procurement attention.";
  } else if (materials.length === 0) {
    emptyReason = "No materials match the current filters.";
  }

  const orderOptions = [...new Map(allRows.flatMap((row) => row.affectedOrders.map((order) => [order.id, order]))).values()].map(
    (order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      productName: order.productName,
    })
  );

  return {
    brand: tenant?.name ?? "Workspace",
    disclaimer: tenant?.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: now.toISOString(),
    view: filters.view,
    kpis: [
      {
        id: "at-risk",
        label: "Materials at risk",
        value: formatCount(atRisk.length),
        hint: "Shortage or projected at-risk",
      },
      {
        id: "shortages",
        label: "Confirmed shortages",
        value: formatCount(shortages.length),
        hint: "Projected available below zero",
      },
      {
        id: "critical",
        label: "Critical shortages",
        value: formatCount(criticalShortages.length),
        hint: "High-priority production impact",
      },
      {
        id: "orders",
        label: "Production orders affected",
        value: formatCount(orderIdsAtRisk.length),
        hint: "Orders with a material shortage",
      },
      {
        id: "incoming",
        label: "Incoming quantity",
        value: formatCount(Math.round(totalIncoming)),
        hint: totalGross > 0 ? `${incomingCoverage}% of gross demand` : "Open receipts in scope",
      },
    ],
    materials,
    orders: orderOptions.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber)),
    orderIdsAtRisk,
    shortageHorizon,
    productionOrdersAffected: orderIdsAtRisk.length,
    bomCycles,
    emptyReason,
  };
}
