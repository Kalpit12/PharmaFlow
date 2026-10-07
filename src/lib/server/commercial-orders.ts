import { Prisma } from "@prisma/client";

import { can, requirePermission } from "@/lib/auth/authorization";
import { writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";

export type OrderFormOptions = {
  canManage: boolean;
  customers: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; sku: string }>;
};

export async function getOrderFormOptions(ctx: TenantContext): Promise<OrderFormOptions> {
  const prisma = getPrisma();
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        category: { notIn: ["Raw material", "Packaging"] },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true },
    }),
  ]);

  return { canManage: can(ctx.role, "sales.manage"), customers, products };
}

export type CreateCustomerOrderInput = {
  customerId: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  status?: "CONFIRMED" | "FULFILLED";
};

export async function createCustomerOrder(ctx: TenantContext, input: CreateCustomerOrderInput) {
  requirePermission(ctx, "sales.manage");
  const prisma = getPrisma();

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, tenantId: ctx.tenantId, status: "ACTIVE" },
  });
  if (!customer) throw new ServerError("Customer not found.", "NOT_FOUND");

  const product = await prisma.product.findFirst({
    where: { id: input.productId, tenantId: ctx.tenantId, status: "ACTIVE" },
  });
  if (!product) throw new ServerError("Product not found.", "NOT_FOUND");

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ServerError("Quantity must be a positive whole number.", "INTERNAL");
  }

  let unitPrice: Prisma.Decimal;
  try {
    unitPrice = new Prisma.Decimal(input.unitPrice.trim());
    if (unitPrice.lte(0)) throw new Error("invalid");
  } catch {
    throw new ServerError("Unit price must be a positive amount.", "INTERNAL");
  }

  const lineTotal = unitPrice.mul(input.quantity);
  const status = input.status ?? "CONFIRMED";
  const orderedAt = new Date();

  const order = await prisma.order.create({
    data: {
      tenantId: ctx.tenantId,
      customerId: customer.id,
      status,
      totalAmount: lineTotal,
      currency: "KES",
      orderedAt,
      items: {
        create: {
          productId: product.id,
          quantity: input.quantity,
          unitPrice,
          totalAmount: lineTotal,
        },
      },
    },
    include: {
      customer: { select: { name: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  });

  await prisma.activity.create({
    data: {
      tenantId: ctx.tenantId,
      type: "ORDER",
      title: "Order confirmed",
      description: `${customer.name} · ${product.name}`,
      entityType: "ORDER",
      entityId: order.id,
      createdAt: orderedAt,
    },
  });

  await writeAuditLog(ctx, {
    action: "CUSTOMER_ORDER_CREATED",
    entityType: "ORDER",
    entityId: order.id,
    newValue: `${customer.name} · ${product.sku} × ${input.quantity}`,
  });

  return {
    id: order.id,
    customerName: order.customer.name,
    productName: order.items[0]?.product.name ?? product.name,
    quantity: input.quantity,
    totalAmount: lineTotal.toFixed(2),
    currency: "KES",
    status,
  };
}
