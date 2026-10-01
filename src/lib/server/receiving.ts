import { Prisma } from "@prisma/client";

import {
  RECEIVING_VIEWS,
  type ReceivePurchaseOrderResult,
  type ReceivingDetail,
  type ReceivingFilters,
  type ReceivingLineInput,
  type ReceivingListRow,
  type ReceivingListSnapshot,
  type ReceivingViewId,
} from "@/lib/receiving/types";
import type { InventoryClassId } from "@/lib/reports/types";
import { requirePermission } from "@/lib/auth/authorization";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";
import { formatCount } from "@/lib/server/money";
import { getTenant } from "@/lib/server/services/tenant";
function requireUser(ctx: TenantContext): string {
  if (!ctx.userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  return ctx.userId;
}

export function resolveReceivingFilters(input: { view?: string; q?: string }): ReceivingFilters {
  const view = RECEIVING_VIEWS.includes(input.view as ReceivingViewId) ? (input.view as ReceivingViewId) : "all";
  return { view, query: input.q?.trim() || undefined };
}

function formatMoney(value: Prisma.Decimal | number, currency: string): string {
  const amount = typeof value === "number" ? value : Number(value);
  return `${currency} ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function poTotals(items: Array<{ quantity: number; receivedQuantity: number }>) {
  const orderedQuantity = items.reduce((sum, row) => sum + row.quantity, 0);
  const receivedQuantity = items.reduce((sum, row) => sum + row.receivedQuantity, 0);
  return { orderedQuantity, receivedQuantity, remainingQuantity: Math.max(orderedQuantity - receivedQuantity, 0) };
}

function isReceivable(status: string, remainingQuantity: number): boolean {
  return status === "APPROVED" && remainingQuantity > 0;
}

async function inferInventoryClass(
  tx: Prisma.TransactionClient,
  tenantId: string,
  productId: string,
  category: string
): Promise<InventoryClassId> {
  const existing = await tx.inventoryLot.findFirst({
    where: { tenantId, productId },
    select: { class: true },
  });
  if (existing) return existing.class as InventoryClassId;
  const normalized = category.toLowerCase();
  if (normalized.includes("packaging")) return "PACKAGING";
  if (normalized.includes("raw")) return "RAW_MATERIAL";
  const asComponent = await tx.billOfMaterial.count({ where: { tenantId, componentId: productId } });
  if (asComponent > 0) return "RAW_MATERIAL";
  return "FINISHED_GOOD";
}

async function recordActivity(
  tx: Prisma.TransactionClient,
  tenantId: string,
  purchaseOrderId: string,
  title: string,
  description: string
) {
  await tx.activity.create({
    data: {
      tenantId,
      type: "NOTE",
      title,
      description,
      entityType: "PURCHASE_ORDER",
      entityId: purchaseOrderId,
    },
  });
}

async function loadWarehouses(tenantId: string) {
  return getPrisma().warehouse.findMany({
    where: { tenantId },
    select: { id: true, name: true, code: true },
    orderBy: { code: "asc" },
  });
}

function mapReceivingRow(
  row: {
    id: string;
    poNumber: string;
    status: string;
    createdAt: Date;
    supplier: { name: string };
    items: Array<{ quantity: number; receivedQuantity: number }>;
    receipts: Array<{ discrepancyReason: string | null }>;
  },
  totals: ReturnType<typeof poTotals>
): ReceivingListRow {
  const partial = totals.receivedQuantity > 0 && totals.remainingQuantity > 0;
  const hasDiscrepancy = row.receipts.some((receipt) => Boolean(receipt.discrepancyReason));
  return {
    id: row.id,
    poNumber: row.poNumber,
    supplierName: row.supplier.name,
    status: row.status === "CLOSED" ? "Fully received" : partial ? "Partially received" : "Awaiting receipt",
    orderedQuantity: totals.orderedQuantity,
    receivedQuantity: totals.receivedQuantity,
    remainingQuantity: totals.remainingQuantity,
    hasDiscrepancy,
    createdAt: row.createdAt.toISOString(),
    href: `/receiving/${row.id}`,
  };
}

export async function getReceivingListSnapshot(ctx: TenantContext, filters: ReceivingFilters): Promise<ReceivingListSnapshot> {
  const tenant = await getTenant(ctx);
  const query = filters.query?.toLowerCase();

  const rows = await getPrisma().purchaseOrder.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { in: ["APPROVED", "CLOSED"] },
    },
    include: {
      supplier: true,
      items: { select: { quantity: true, receivedQuantity: true } },
      receipts: { select: { discrepancyReason: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const mapped = rows
    .map((row) => mapReceivingRow(row, poTotals(row.items)))
    .filter((row) => {
      if (filters.view === "awaiting") return row.remainingQuantity > 0 && row.receivedQuantity === 0;
      if (filters.view === "partial") return row.receivedQuantity > 0 && row.remainingQuantity > 0;
      if (filters.view === "complete") return row.remainingQuantity === 0;
      if (filters.view === "discrepancy") return row.hasDiscrepancy;
      return true;
    })
    .filter((row) => {
      if (!query) return true;
      return row.poNumber.toLowerCase().includes(query) || row.supplierName.toLowerCase().includes(query);
    });

  const all = rows.map((row) => mapReceivingRow(row, poTotals(row.items)));
  const awaiting = all.filter((row) => row.remainingQuantity > 0 && row.receivedQuantity === 0).length;
  const partial = all.filter((row) => row.receivedQuantity > 0 && row.remainingQuantity > 0).length;
  const complete = all.filter((row) => row.remainingQuantity === 0).length;
  const discrepancies = all.filter((row) => row.hasDiscrepancy).length;

  return {
    brand: tenant.name,
    disclaimer: tenant.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: new Date().toISOString(),
    view: filters.view,
    kpis: [
      { id: "awaiting", label: "Awaiting receipt", value: formatCount(awaiting) },
      { id: "partial", label: "Partially received", value: formatCount(partial) },
      { id: "complete", label: "Fully received", value: formatCount(complete) },
      { id: "discrepancy", label: "Discrepancies", value: formatCount(discrepancies) },
    ],
    rows: mapped,
    emptyReason: mapped.length === 0 ? "No approved purchase orders are ready for receiving." : null,
    planningNote: "Receiving updates inventory. No supplier communication or payment occurs.",
  };
}

export async function getReceivingDetail(ctx: TenantContext, purchaseOrderId: string): Promise<ReceivingDetail> {
  const row = await getPrisma().purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId: ctx.tenantId },
    include: {
      supplier: true,
      procurementRfq: { select: { id: true, reference: true } },
      items: { include: { product: { select: { sku: true, category: true } } } },
      receipts: {
        include: {
          inventoryLot: { select: { batchCode: true } },
          receivedBy: { select: { name: true } },
        },
        orderBy: { receivedAt: "desc" },
      },
    },
  });
  if (!row) throw new ServerError("Purchase order not found.", "NOT_FOUND");

  const totals = poTotals(row.items);
  const warehouses = await loadWarehouses(ctx.tenantId);
  const currency = row.currency.trim();

  return {
    id: row.id,
    poNumber: row.poNumber,
    status: row.status,
    supplierName: row.supplier.name,
    supplierCode: row.supplier.code,
    currency,
    canReceive: isReceivable(row.status, totals.remainingQuantity),
    fullyReceived: totals.remainingQuantity === 0,
    orderedQuantity: totals.orderedQuantity,
    receivedQuantity: totals.receivedQuantity,
    remainingQuantity: totals.remainingQuantity,
    rfqHref: row.procurementRfq ? `/rfqs/${row.procurementRfq.id}` : null,
    rfqReference: row.procurementRfq?.reference ?? null,
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      description: item.description,
      sku: item.product.sku,
      orderedQuantity: item.quantity,
      receivedQuantity: item.receivedQuantity,
      remainingQuantity: Math.max(item.quantity - item.receivedQuantity, 0),
      unitPrice: formatMoney(item.unitPrice, currency),
      currency,
      warehouses,
    })),
    receipts: row.receipts
      .filter((receipt) => receipt.status === "RECEIVED")
      .map((receipt) => ({
        id: receipt.id,
        reference: receipt.reference,
        quantity: receipt.quantity,
        batchCode: receipt.inventoryLot?.batchCode ?? null,
        receivedAt: receipt.receivedAt?.toISOString() ?? receipt.createdAt.toISOString(),
        discrepancyReason: receipt.discrepancyReason,
        receivedByName: receipt.receivedBy?.name ?? null,
      })),
  };
}

function detectDiscrepancies(input: {
  ordered: number;
  previouslyReceived: number;
  receiveNow: number;
  expiryDate: Date | null;
  batchCode: string;
}): string[] {
  const reasons: string[] = [];
  const remaining = input.ordered - input.previouslyReceived - input.receiveNow;
  if (remaining > 0) reasons.push(`Short receipt: ${remaining} units still outstanding`);
  if (!input.batchCode.trim()) reasons.push("Missing batch/lot number");
  if (input.expiryDate && input.expiryDate.getTime() < Date.now()) reasons.push("Expiry date is in the past");
  return reasons;
}

export async function receivePurchaseOrderGoods(
  ctx: TenantContext,
  purchaseOrderId: string,
  input: { idempotencyKey: string; lines: ReceivingLineInput[] }
): Promise<ReceivePurchaseOrderResult> {
  requirePermission(ctx, "inventory.receive");
  const userId = requireUser(ctx);
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!idempotencyKey) throw new ServerError("Idempotency key is required.", "INTERNAL");
  if (!input.lines.length) throw new ServerError("At least one line is required.", "INTERNAL");

  const prisma = getPrisma();
  const existing = await prisma.inventoryReceipt.findMany({
    where: { tenantId: ctx.tenantId, idempotencyKey: { startsWith: `${idempotencyKey}:` } },
    include: { purchaseOrder: { select: { id: true, poNumber: true, status: true } } },
  });
  if (existing.length > 0 && existing[0]?.purchaseOrder) {
    const detail = await getReceivingDetail(ctx, existing[0].purchaseOrder.id);
    const receivedNow = existing.reduce((sum, row) => sum + row.quantity, 0);
    const disc = existing.map((row) => row.discrepancyReason).filter(Boolean) as string[];
    return {
      purchaseOrderId: detail.id,
      poNumber: detail.poNumber,
      status: detail.status,
      receivedNow,
      discrepancies: [...new Set(disc)],
      fullyReceived: detail.fullyReceived,
    };
  }

  const discrepancies: string[] = [];
  let receivedNow = 0;

  const result = await prisma.$transaction(
    async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, tenantId: ctx.tenantId },
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
      });
      if (!po) throw new ServerError("Purchase order not found.", "NOT_FOUND");
      if (po.status !== "APPROVED") throw new ServerError("Only approved purchase orders can be received.", "INTERNAL");

      const itemById = new Map(po.items.map((row) => [row.id, row]));
      const now = new Date();
      const lineSummaries: string[] = [];

      for (const line of input.lines) {
        if (line.quantityReceived <= 0) continue;
        const item = itemById.get(line.purchaseOrderItemId);
        if (!item || item.purchaseOrderId !== po.id) throw new ServerError("Invalid purchase order line.", "INTERNAL");

        const remaining = item.quantity - item.receivedQuantity;
        if (line.quantityReceived > remaining) {
          throw new ServerError(`Over-receipt rejected for ${item.product.sku}.`, "INTERNAL");
        }

        const warehouse = await tx.warehouse.findFirst({ where: { id: line.warehouseId, tenantId: ctx.tenantId } });
        if (!warehouse) throw new ServerError("Invalid warehouse.", "INTERNAL");

        const batchCode = line.batchCode.trim();
        if (!batchCode) throw new ServerError("Batch/lot number is required.", "INTERNAL");

        const duplicateBatch = await tx.inventoryLot.findFirst({ where: { tenantId: ctx.tenantId, batchCode } });
        if (duplicateBatch) throw new ServerError(`Batch code ${batchCode} already exists.`, "INTERNAL");

        let expiryDate: Date | null = null;
        if (line.expiryDate) {
          expiryDate = new Date(line.expiryDate);
          if (Number.isNaN(expiryDate.getTime())) throw new ServerError("Invalid expiry date.", "INTERNAL");
        }

        const lineDiscrepancies = detectDiscrepancies({
          ordered: item.quantity,
          previouslyReceived: item.receivedQuantity,
          receiveNow: line.quantityReceived,
          expiryDate,
          batchCode,
        });
        discrepancies.push(...lineDiscrepancies);

        const invClass = await inferInventoryClass(tx, ctx.tenantId, item.productId, item.product.category);
        const lot = await tx.inventoryLot.create({
          data: {
            tenantId: ctx.tenantId,
            productId: item.productId,
            warehouseId: warehouse.id,
            supplierId: po.supplierId,
            class: invClass,
            batchCode,
            quantity: line.quantityReceived,
            unitValue: item.unitPrice,
            receivedAt: now,
            expiryDate,
          },
        });

        const reference = `RCV-${po.poNumber}-${batchCode}`;
        const discrepancyReason = lineDiscrepancies.length > 0 ? lineDiscrepancies.join("; ") : null;
        await tx.inventoryReceipt.create({
          data: {
            tenantId: ctx.tenantId,
            productId: item.productId,
            warehouseId: warehouse.id,
            supplierId: po.supplierId,
            purchaseOrderId: po.id,
            purchaseOrderItemId: item.id,
            inventoryLotId: lot.id,
            receivedById: userId,
            reference,
            quantity: line.quantityReceived,
            status: "RECEIVED",
            expectedAt: now,
            receivedAt: now,
            idempotencyKey: `${idempotencyKey}:${item.id}`,
            discrepancyReason,
            notes: line.notes?.trim() || null,
          },
        });

        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQuantity: item.receivedQuantity + line.quantityReceived },
        });

        item.receivedQuantity += line.quantityReceived;
        receivedNow += line.quantityReceived;
        lineSummaries.push(`${item.product.sku} · ${line.quantityReceived} · ${batchCode}`);
      }

      if (receivedNow <= 0) throw new ServerError("No quantities to receive.", "INTERNAL");

      const refreshedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
      const totals = poTotals(refreshedItems);
      const fullyReceived = totals.remainingQuantity === 0;

      await tx.purchaseOrder.updateMany({
        where: { id: po.id, tenantId: ctx.tenantId },
        data: { status: fullyReceived ? "CLOSED" : "APPROVED" },
      });

      const title = fullyReceived ? "Purchase order fully received" : "Partial receipt recorded";
      const description = `${po.poNumber} · ${receivedNow} units now · ${totals.receivedQuantity}/${totals.orderedQuantity} total · ${lineSummaries.join("; ")}`;
      await recordActivity(tx, ctx.tenantId, po.id, title, description);
      if (discrepancies.length > 0) {
        await recordActivity(tx, ctx.tenantId, po.id, "Receiving discrepancy detected", discrepancies.join("; "));
      }

      return {
        purchaseOrderId: po.id,
        poNumber: po.poNumber,
        status: fullyReceived ? "CLOSED" : "APPROVED",
        receivedNow,
        discrepancies: [...new Set(discrepancies)],
        fullyReceived,
      };
    },
    { timeout: 15_000 }
  );

  return result;
}

export async function getReceivingReportMetrics(ctx: TenantContext) {
  const rows = await getPrisma().purchaseOrder.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["APPROVED", "CLOSED"] } },
    include: {
      items: { select: { quantity: true, receivedQuantity: true } },
      receipts: { where: { discrepancyReason: { not: null } }, select: { id: true } },
    },
  });

  let awaiting = 0;
  let partial = 0;
  let complete = 0;
  let outstandingQty = 0;
  let receivedQty = 0;
  let discrepancyCount = 0;

  for (const row of rows) {
    const totals = poTotals(row.items);
    receivedQty += totals.receivedQuantity;
    outstandingQty += totals.remainingQuantity;
    if (totals.remainingQuantity === 0) complete += 1;
    else if (totals.receivedQuantity > 0) partial += 1;
    else awaiting += 1;
    if (row.receipts.length > 0) discrepancyCount += 1;
  }

  return { awaiting, partial, complete, outstandingQty, receivedQty, discrepancyCount };
}

export async function countAwaitingReceipt(ctx: TenantContext): Promise<number> {
  const rows = await getPrisma().purchaseOrder.findMany({
    where: { tenantId: ctx.tenantId, status: "APPROVED" },
    include: { items: { select: { quantity: true, receivedQuantity: true } } },
  });
  return rows.filter((row) => poTotals(row.items).remainingQuantity > 0).length;
}
