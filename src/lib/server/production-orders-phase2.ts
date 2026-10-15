import type { ProductionOrderKind, ProductionScheduleDirection } from "@prisma/client";

import { requirePermission } from "@/lib/auth/authorization";
import { computeBatchSizing } from "@/lib/operations/batch-sizing";
import { instantiateOperationsForOrder, simulateDeliveryDate } from "@/lib/server/aps-plan";
import { writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";

export type ProductionOrdersSnapshot = {
  orders: Array<{
    id: string;
    orderNumber: string;
    productName: string;
    productSku: string;
    customerName: string | null;
    quantity: number;
    priority: string;
    status: string;
    orderKind: ProductionOrderKind;
    scheduleDirection: ProductionScheduleDirection;
    dueDate: string;
    earliestStartAt: string | null;
    feasibleEndAt: string | null;
    batchNumber: string | null;
    operationCount: number;
    isPartialBatch: boolean;
    wholeBatchCount: number | null;
    partialBatchRemainder: number;
    reserveCapacity: boolean;
    campaignCode: string | null;
    attachmentCount: number;
  }>;
  prospects: number;
  campaigns: Array<{ id: string; code: string; name: string; productName: string; status: string; orderCount: number }>;
  customers: Array<{ id: string; name: string; defaultPriority: string }>;
  products: Array<{ id: string; name: string; sku: string; validatedBatchSize: number | null }>;
};

function parseScheduleDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ServerError(`${label} is not a valid date.`, "INTERNAL");
  return date;
}

async function nextOrderNumber(tenantId: string, prefix: string): Promise<string> {
  const prisma = getPrisma();
  const year = new Date().getUTCFullYear();
  const count = await prisma.productionOrder.count({ where: { tenantId } });
  return `${prefix}-${year}-${String(count + 1).padStart(3, "0")}`;
}

async function nextBatchNumber(tenantId: string): Promise<string> {
  const prisma = getPrisma();
  const year = new Date().getUTCFullYear();
  const count = await prisma.productionBatch.count({ where: { tenantId } });
  return `LAB-${year}-${String(count + 1).padStart(3, "0")}`;
}

type CreateOrderCore = {
  productId: string;
  quantity: number;
  priority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  dueDate: string;
  durationMinutes?: number;
  customerId?: string | null;
  earliestStartAt?: string | null;
  scheduleDirection?: ProductionScheduleDirection;
  orderKind?: ProductionOrderKind;
  reserveCapacity?: boolean;
  campaignId?: string | null;
};

export async function createProductionOrderPhase2(ctx: TenantContext, input: CreateOrderCore) {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const product = await prisma.product.findFirst({
    where: { id: input.productId, tenantId: ctx.tenantId, status: "ACTIVE" },
  });
  if (!product) throw new ServerError("Product not found.", "NOT_FOUND");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ServerError("Quantity must be a positive whole number.", "INTERNAL");
  }

  let priority = input.priority ?? "NORMAL";
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, tenantId: ctx.tenantId },
      select: { defaultPriority: true },
    });
    if (!customer) throw new ServerError("Customer not found.", "NOT_FOUND");
    if (!input.priority) priority = customer.defaultPriority;
  }

  const sizing = computeBatchSizing(input.quantity, product.validatedBatchSize);
  const dueDate = parseScheduleDate(input.dueDate, "Due date");
  const earliestStartAt = input.earliestStartAt ? parseScheduleDate(input.earliestStartAt, "Earliest start") : null;
  const durationMinutes = input.durationMinutes ?? 480;
  const orderKind = input.orderKind ?? "FIRM";
  const prefix = orderKind === "PROSPECT" ? "PRP" : "PRO";
  const orderNumber = await nextOrderNumber(ctx.tenantId, prefix);
  const batchNumber = await nextBatchNumber(ctx.tenantId);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.productionOrder.create({
      data: {
        tenantId: ctx.tenantId,
        orderNumber,
        productId: product.id,
        customerId: input.customerId ?? null,
        campaignId: input.campaignId ?? null,
        quantity: input.quantity,
        priority,
        status: "UNSCHEDULED",
        orderKind,
        scheduleDirection: input.scheduleDirection ?? "FORWARD",
        earliestStartAt,
        dueDate,
        durationMinutes,
        validatedBatchSize: sizing.validatedBatchSize,
        wholeBatchCount: sizing.wholeBatchCount,
        partialBatchRemainder: sizing.partialBatchRemainder,
        reserveCapacity: input.reserveCapacity ?? false,
        isLocked: false,
      },
    });
    await tx.productionBatch.create({
      data: {
        tenantId: ctx.tenantId,
        productionOrderId: created.id,
        batchNumber,
        plannedQuantity: sizing.plannedBatchQuantity,
        qualityStatus: "PENDING_REVIEW",
      },
    });
    await instantiateOperationsForOrder(tx, ctx.tenantId, created);
    return created;
  });

  await writeAuditLog(ctx, {
    action: orderKind === "PROSPECT" ? "PRODUCTION_PROSPECT_CREATED" : "PRODUCTION_ORDER_CREATED",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    newValue: orderNumber,
  });

  return { id: order.id, orderNumber, batchNumber, sizing };
}

export async function createProductionProspect(
  ctx: TenantContext,
  input: CreateOrderCore & { simulate?: boolean }
) {
  const created = await createProductionOrderPhase2(ctx, {
    ...input,
    orderKind: "PROSPECT",
  });

  if (input.simulate !== false) {
    const simulation = await simulateDeliveryDate(ctx, {
      productId: input.productId,
      quantity: input.quantity,
      priority: input.priority,
      dueDate: input.dueDate,
    });
    if (simulation.feasibleEnd) {
      await getPrisma().productionOrder.update({
        where: { id: created.id },
        data: { feasibleEndAt: new Date(simulation.feasibleEnd) },
      });
    }
    return { ...created, simulation };
  }

  return created;
}

export async function convertProspectToFirmOrder(ctx: TenantContext, orderId: string) {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const order = await prisma.productionOrder.findFirst({
    where: { id: orderId, tenantId: ctx.tenantId },
  });
  if (!order) throw new ServerError("Production order not found.", "NOT_FOUND");
  if (order.orderKind !== "PROSPECT") {
    throw new ServerError("Only job prospects can be converted to firm orders.", "INTERNAL");
  }

  const updated = await prisma.productionOrder.update({
    where: { id: order.id },
    data: { orderKind: "FIRM" },
  });

  await writeAuditLog(ctx, {
    action: "PRODUCTION_PROSPECT_CONVERTED",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    oldValue: order.orderNumber,
    newValue: `${order.orderNumber} → firm`,
  });

  return { id: updated.id, orderNumber: updated.orderNumber };
}

export async function getProductionOrdersSnapshot(ctx: TenantContext): Promise<ProductionOrdersSnapshot> {
  requirePermission(ctx, "production.read");
  const prisma = getPrisma();

  const [orders, campaigns, customers, products] = await Promise.all([
    prisma.productionOrder.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        product: { select: { name: true, sku: true } },
        customer: { select: { name: true } },
        batch: { select: { batchNumber: true } },
        campaign: { select: { code: true } },
        _count: { select: { operations: true, attachments: true } },
      },
      orderBy: [{ orderKind: "asc" }, { dueDate: "asc" }],
      take: 100,
    }),
    prisma.productionCampaign.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        product: { select: { name: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.customer.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, defaultPriority: true },
      orderBy: { name: "asc" },
      take: 50,
    }),
    prisma.product.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, sku: true, validatedBatchSize: true },
      orderBy: { name: "asc" },
      take: 80,
    }),
  ]);

  return {
    orders: orders.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      productName: row.product.name,
      productSku: row.product.sku,
      customerName: row.customer?.name ?? null,
      quantity: row.quantity,
      priority: row.priority,
      status: row.status,
      orderKind: row.orderKind,
      scheduleDirection: row.scheduleDirection,
      dueDate: row.dueDate.toISOString(),
      earliestStartAt: row.earliestStartAt?.toISOString() ?? null,
      feasibleEndAt: row.feasibleEndAt?.toISOString() ?? null,
      batchNumber: row.batch?.batchNumber ?? null,
      operationCount: row._count.operations,
      isPartialBatch: row.partialBatchRemainder > 0,
      wholeBatchCount: row.wholeBatchCount,
      partialBatchRemainder: row.partialBatchRemainder,
      reserveCapacity: row.reserveCapacity,
      campaignCode: row.campaign?.code ?? null,
      attachmentCount: row._count.attachments,
    })),
    prospects: orders.filter((row) => row.orderKind === "PROSPECT").length,
    campaigns: campaigns.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      productName: row.product.name,
      status: row.status,
      orderCount: row._count.orders,
    })),
    customers,
    products,
  };
}
