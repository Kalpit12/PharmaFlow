import { Prisma } from "@prisma/client";

import {
  PURCHASE_ORDER_VIEWS,
  type CompactPurchaseOrderContext,
  type PurchaseOrderApprovalItem,
  type PurchaseOrderDetail,
  type PurchaseOrderListRow,
  type PurchaseOrderListSnapshot,
  type PurchaseOrderStatus,
  type PurchaseOrderViewId,
} from "@/lib/purchase-orders/types";
import { canProcurementApprove, requirePermission } from "@/lib/auth/authorization";
import { formatStateChange, writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";
import { formatCount } from "@/lib/server/money";
import { getTenant } from "@/lib/server/services/tenant";

const ACTIVE_PO_STATUSES: PurchaseOrderStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED"];

export type PurchaseOrderFilters = {
  view: PurchaseOrderViewId;
  query?: string;
};

function requireUser(ctx: TenantContext): string {
  if (!ctx.userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  return ctx.userId;
}

function requireReviewer(ctx: TenantContext): void {
  if (!canProcurementApprove(ctx.role)) throw new ServerError("You do not have permission to perform this action.", "FORBIDDEN");
}

export function resolvePurchaseOrderFilters(input: { view?: string; q?: string }): PurchaseOrderFilters {
  const view = PURCHASE_ORDER_VIEWS.includes(input.view as PurchaseOrderViewId) ? (input.view as PurchaseOrderViewId) : "all";
  return { view, query: input.q?.trim() || undefined };
}

function parseView(value: PurchaseOrderViewId): PurchaseOrderStatus | undefined {
  const map: Record<Exclude<PurchaseOrderViewId, "all">, PurchaseOrderStatus> = {
    draft: "DRAFT",
    pending: "PENDING_APPROVAL",
    approved: "APPROVED",
    rejected: "REJECTED",
    cancelled: "CANCELLED",
  };
  return value === "all" ? undefined : map[value];
}

async function nextPoNumber(tenantId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `PO-${year}-`;
  const count = await getPrisma().purchaseOrder.count({
    where: { tenantId, poNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

function formatMoney(value: Prisma.Decimal | number, currency: string): string {
  const amount = typeof value === "number" ? value : Number(value);
  return `${currency} ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcSubtotal(items: Array<{ quantity: number; unitPrice: Prisma.Decimal }>): Prisma.Decimal {
  let sum = 0;
  for (const row of items) {
    sum += row.quantity * Number(row.unitPrice);
  }
  return new Prisma.Decimal(sum.toFixed(2));
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

async function loadDetail(ctx: TenantContext, id: string): Promise<PurchaseOrderDetail> {
  const row = await getPrisma().purchaseOrder.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      supplier: true,
      createdBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      procurementRfq: { select: { id: true, reference: true } },
      items: { include: { product: { select: { sku: true } } } },
    },
  });
  if (!row) throw new ServerError("Purchase order not found.", "NOT_FOUND");

  const totals = row.items.reduce(
    (acc, item) => {
      acc.received += item.receivedQuantity;
      acc.ordered += item.quantity;
      return acc;
    },
    { received: 0, ordered: 0 }
  );
  const remainingQuantity = Math.max(totals.ordered - totals.received, 0);
  const canReceive = row.status === "APPROVED" && remainingQuantity > 0;

  return {
    id: row.id,
    poNumber: row.poNumber,
    status: row.status as PurchaseOrderStatus,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    supplierCode: row.supplier.code,
    procurementRfqId: row.procurementRfqId,
    rfqReference: row.procurementRfq?.reference ?? null,
    rfqHref: row.procurementRfqId ? `/rfqs/${row.procurementRfqId}` : null,
    procurementRequisitionId: row.procurementRequisitionId,
    requisitionHref: row.procurementRequisitionId ? `/procurement?requisition=${row.procurementRequisitionId}` : null,
    currency: row.currency.trim(),
    subtotal: formatMoney(row.subtotal, row.currency.trim()),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdBy.name,
    reviewedByName: row.reviewedBy?.name ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      description: item.description,
      sku: item.product.sku,
      quantity: item.quantity,
      receivedQuantity: item.receivedQuantity,
      remainingQuantity: Math.max(item.quantity - item.receivedQuantity, 0),
      unitPrice: Number(item.unitPrice).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      currency: item.currency.trim(),
      lineTotal: formatMoney(item.lineTotal, item.currency.trim()),
    })),
    canEdit: row.status === "DRAFT",
    canSubmit: row.status === "DRAFT",
    canApprove: canProcurementApprove(ctx.role) && row.status === "PENDING_APPROVAL",
    canReceive,
    receivingHref: canReceive ? `/receiving/${row.id}` : null,
    receivedQuantity: totals.received,
    remainingQuantity,
  };
}

export async function getPurchaseOrderListSnapshot(ctx: TenantContext, filters: PurchaseOrderFilters): Promise<PurchaseOrderListSnapshot> {
  const tenant = await getTenant(ctx);
  const status = parseView(filters.view);
  const query = filters.query?.toLowerCase();

  const rows = await getPrisma().purchaseOrder.findMany({
    where: { tenantId: ctx.tenantId, ...(status ? { status } : {}) },
    include: {
      supplier: true,
      createdBy: { select: { name: true } },
      procurementRfq: { select: { reference: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const mapped: PurchaseOrderListRow[] = rows
    .map((row) => ({
      id: row.id,
      poNumber: row.poNumber,
      status: row.status as PurchaseOrderStatus,
      supplierName: row.supplier.name,
      rfqReference: row.procurementRfq?.reference ?? null,
      totalLabel: formatMoney(row.subtotal, row.currency.trim()),
      currency: row.currency.trim(),
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdBy.name,
    }))
    .filter((row) => {
      if (!query) return true;
      return (
        row.poNumber.toLowerCase().includes(query) ||
        row.supplierName.toLowerCase().includes(query) ||
        (row.rfqReference?.toLowerCase().includes(query) ?? false)
      );
    });

  const all = await getPrisma().purchaseOrder.findMany({ where: { tenantId: ctx.tenantId }, select: { status: true, subtotal: true, currency: true } });
  const count = (value: PurchaseOrderStatus) => formatCount(all.filter((row) => row.status === value).length);
  const approvedValue = all
    .filter((row) => row.status === "APPROVED")
    .reduce((sum, row) => sum + Number(row.subtotal), 0);

  return {
    brand: tenant.name,
    disclaimer: tenant.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: new Date().toISOString(),
    view: filters.view,
    kpis: [
      { id: "draft", label: "Draft", value: count("DRAFT") },
      { id: "pending", label: "Pending approval", value: count("PENDING_APPROVAL") },
      { id: "approved", label: "Approved", value: count("APPROVED") },
      { id: "rejected", label: "Rejected", value: count("REJECTED") },
      { id: "total", label: "Total POs", value: formatCount(all.length) },
      {
        id: "approved-value",
        label: "Approved purchasing value",
        value: approvedValue > 0 ? `KES ${approvedValue.toLocaleString("en-KE")}` : "—",
      },
    ],
    rows: mapped,
    emptyReason: mapped.length === 0 ? "No purchase orders yet. Create one from an awarded procurement RFQ." : null,
    planningNote: "Approved for purchasing only. No supplier communication, payment, or inventory receipt occurs in Pharmaflow.",
  };
}

export async function getPurchaseOrderDetail(ctx: TenantContext, id: string): Promise<PurchaseOrderDetail> {
  return loadDetail(ctx, id);
}

export async function findPurchaseOrderByRfq(ctx: TenantContext, rfqId: string): Promise<{ id: string; poNumber: string; status: PurchaseOrderStatus } | null> {
  const row = await getPrisma().purchaseOrder.findFirst({
    where: { tenantId: ctx.tenantId, procurementRfqId: rfqId },
    select: { id: true, poNumber: true, status: true },
  });
  if (!row) return null;
  return { id: row.id, poNumber: row.poNumber, status: row.status as PurchaseOrderStatus };
}

export async function createPurchaseOrderFromRfq(ctx: TenantContext, rfqId: string): Promise<PurchaseOrderDetail> {
  requirePermission(ctx, "procurement.create");
  const userId = requireUser(ctx);
  const prisma = getPrisma();

  const existing = await prisma.purchaseOrder.findFirst({
    where: { tenantId: ctx.tenantId, procurementRfqId: rfqId, status: { in: ACTIVE_PO_STATUSES } },
  });
  if (existing) return loadDetail(ctx, existing.id);

  const duplicate = await prisma.purchaseOrder.findFirst({ where: { tenantId: ctx.tenantId, procurementRfqId: rfqId } });
  if (duplicate) {
    throw new ServerError(`Purchase order ${duplicate.poNumber} already exists for this RFQ.`, "INTERNAL");
  }

  const rfq = await prisma.procurementRfq.findFirst({
    where: { id: rfqId, tenantId: ctx.tenantId },
    include: {
      items: { include: { product: true } },
      awardedResponse: {
        include: {
          items: { include: { rfqItem: { include: { product: true } } } },
          rfqSupplier: { include: { supplier: true } },
        },
      },
    },
  });
  if (!rfq) throw new ServerError("RFQ not found.", "NOT_FOUND");
  if (rfq.status !== "AWARDED" || !rfq.awardedResponseId || !rfq.awardedResponse) {
    throw new ServerError("Only awarded RFQs can create purchase orders.", "INTERNAL");
  }

  const response = rfq.awardedResponse;
  const supplier = response.rfqSupplier.supplier;
  if (supplier.status !== "ACTIVE") throw new ServerError("Awarded supplier is not active.", "INTERNAL");
  const currency = response.currency?.trim().toUpperCase();
  if (!currency) throw new ServerError("Awarded response is missing currency.", "INTERNAL");

  const lineInputs: Array<{ productId: string; description: string; quantity: number; unitPrice: Prisma.Decimal }> = [];
  for (const item of response.items) {
    if (!item.unitPrice || item.quantity <= 0) {
      throw new ServerError("Awarded response is missing quoted prices or quantities.", "INTERNAL");
    }
    lineInputs.push({
      productId: item.rfqItem.productId,
      description: `${item.rfqItem.product.name} (${item.rfqItem.product.sku})`,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    });
  }
  if (lineInputs.length === 0) throw new ServerError("Awarded response has no line items.", "INTERNAL");

  const subtotal = calcSubtotal(lineInputs);
  const poNumber = await nextPoNumber(ctx.tenantId);

  const created = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        tenantId: ctx.tenantId,
        poNumber,
        status: "DRAFT",
        supplierId: supplier.id,
        procurementRfqId: rfq.id,
        procurementRequisitionId: rfq.procurementRequisitionId,
        createdById: userId,
        currency,
        subtotal,
        notes: response.notes,
        items: {
          create: lineInputs.map((row) => ({
            productId: row.productId,
            description: row.description,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            currency,
            lineTotal: new Prisma.Decimal((row.quantity * Number(row.unitPrice)).toFixed(2)),
          })),
        },
      },
    });
    await recordActivity(tx, ctx.tenantId, po.id, "Purchase order created", `${poNumber} · ${supplier.name}`);
    return po;
  }, { timeout: 15_000 });

  return loadDetail(ctx, created.id);
}

export async function updatePurchaseOrderDraft(
  ctx: TenantContext,
  id: string,
  input: { notes?: string | null; items: Array<{ id: string; quantity: number; unitPrice: number }> }
): Promise<PurchaseOrderDetail> {
  requireUser(ctx);
  const prisma = getPrisma();
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { items: true },
  });
  if (!po) throw new ServerError("Purchase order not found.", "NOT_FOUND");
  if (po.status !== "DRAFT") throw new ServerError("Only draft purchase orders can be edited.", "INTERNAL");

  const itemById = new Map(po.items.map((row) => [row.id, row]));
  const updates: Array<{ id: string; quantity: number; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }> = [];
  for (const row of input.items) {
    const existing = itemById.get(row.id);
    if (!existing) throw new ServerError("Invalid line item.", "INTERNAL");
    if (row.quantity <= 0 || row.unitPrice < 0) throw new ServerError("Quantity and unit price must be valid.", "INTERNAL");
    const unitPrice = new Prisma.Decimal(row.unitPrice.toFixed(2));
    updates.push({
      id: row.id,
      quantity: row.quantity,
      unitPrice,
      lineTotal: new Prisma.Decimal((row.quantity * row.unitPrice).toFixed(2)),
    });
  }

  const subtotal = calcSubtotal(updates.map((row) => ({ quantity: row.quantity, unitPrice: row.unitPrice })));

  await prisma.$transaction([
    ...updates.map((row) =>
      prisma.purchaseOrderItem.updateMany({
        where: { id: row.id, purchaseOrderId: id },
        data: { quantity: row.quantity, unitPrice: row.unitPrice, lineTotal: row.lineTotal },
      })
    ),
    prisma.purchaseOrder.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: { subtotal, notes: input.notes?.trim() || null },
    }),
  ]);

  return loadDetail(ctx, id);
}

export async function submitPurchaseOrderForApproval(ctx: TenantContext, id: string): Promise<PurchaseOrderDetail> {
  requirePermission(ctx, "procurement.create");
  requireUser(ctx);
  const prisma = getPrisma();
  const po = await prisma.purchaseOrder.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!po) throw new ServerError("Purchase order not found.", "NOT_FOUND");
  if (po.status !== "DRAFT") throw new ServerError("Only draft purchase orders can be submitted.", "INTERNAL");

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { status: "PENDING_APPROVAL" } });
    await recordActivity(tx, ctx.tenantId, id, "Purchase order submitted for approval", po.poNumber);
  }, { timeout: 15_000 });

  return loadDetail(ctx, id);
}

export async function approvePurchaseOrder(ctx: TenantContext, id: string): Promise<PurchaseOrderDetail> {
  requireReviewer(ctx);
  const userId = requireUser(ctx);
  const prisma = getPrisma();
  const po = await prisma.purchaseOrder.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!po) throw new ServerError("Purchase order not found.", "NOT_FOUND");
  if (po.status === "APPROVED") return loadDetail(ctx, id);
  if (po.status !== "PENDING_APPROVAL") throw new ServerError("Purchase order is not pending approval.", "INTERNAL");

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: { status: "APPROVED", reviewedById: userId, reviewedAt: new Date() },
    });
    await recordActivity(tx, ctx.tenantId, id, "Purchase order approved", `${po.poNumber} · approved for purchasing`);
  }, { timeout: 15_000 });

  const change = formatStateChange("APPROVAL", "PENDING_APPROVAL", "APPROVED");
  await writeAuditLog(ctx, {
    action: "PO_APPROVED",
    entityType: "PURCHASE_ORDER",
    entityId: id,
    oldValue: change.oldValue,
    newValue: change.newValue,
  });

  return loadDetail(ctx, id);
}

export async function rejectPurchaseOrder(ctx: TenantContext, id: string): Promise<PurchaseOrderDetail> {
  requireReviewer(ctx);
  const userId = requireUser(ctx);
  const prisma = getPrisma();
  const po = await prisma.purchaseOrder.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!po) throw new ServerError("Purchase order not found.", "NOT_FOUND");
  if (po.status === "REJECTED") return loadDetail(ctx, id);
  if (po.status !== "PENDING_APPROVAL") throw new ServerError("Purchase order is not pending approval.", "INTERNAL");

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: { status: "REJECTED", reviewedById: userId, reviewedAt: new Date() },
    });
    await recordActivity(tx, ctx.tenantId, id, "Purchase order rejected", po.poNumber);
  }, { timeout: 15_000 });

  const change = formatStateChange("APPROVAL", "PENDING_APPROVAL", "REJECTED");
  await writeAuditLog(ctx, {
    action: "PO_REJECTED",
    entityType: "PURCHASE_ORDER",
    entityId: id,
    oldValue: change.oldValue,
    newValue: change.newValue,
  });

  return loadDetail(ctx, id);
}

export async function listPendingPurchaseOrders(ctx: TenantContext): Promise<PurchaseOrderApprovalItem[]> {
  const rows = await getPrisma().purchaseOrder.findMany({
    where: { tenantId: ctx.tenantId, status: "PENDING_APPROVAL" },
    include: { supplier: true, createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    poNumber: row.poNumber,
    supplierName: row.supplier.name,
    totalLabel: formatMoney(row.subtotal, row.currency.trim()),
    status: row.status as PurchaseOrderStatus,
    createdByName: row.createdBy.name,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function countPendingPurchaseOrders(ctx: TenantContext): Promise<number> {
  return getPrisma().purchaseOrder.count({ where: { tenantId: ctx.tenantId, status: "PENDING_APPROVAL" } });
}

export async function getPurchaseOrderReportMetrics(ctx: TenantContext) {
  const rows = await getPrisma().purchaseOrder.findMany({ where: { tenantId: ctx.tenantId } });
  const approved = rows.filter((row) => row.status === "APPROVED");
  const currencies = new Set(approved.map((row) => row.currency.trim()));
  const approvedValue = currencies.size === 1 ? approved.reduce((sum, row) => sum + Number(row.subtotal), 0) : null;
  return {
    draft: rows.filter((row) => row.status === "DRAFT").length,
    pendingApproval: rows.filter((row) => row.status === "PENDING_APPROVAL").length,
    approved: approved.length,
    approvedValue,
    approvedCurrency: currencies.size === 1 ? [...currencies][0] ?? null : null,
  };
}

export function toCompactPurchaseOrderContext(detail: PurchaseOrderDetail): CompactPurchaseOrderContext {
  return {
    poNumber: detail.poNumber,
    status: detail.status,
    supplier: detail.supplierName,
    currency: detail.currency,
    subtotal: detail.subtotal,
    items: detail.items.map((row) => ({
      description: row.description,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      lineTotal: row.lineTotal,
    })),
    rfqReference: detail.rfqReference,
    notes: detail.notes,
  };
}
