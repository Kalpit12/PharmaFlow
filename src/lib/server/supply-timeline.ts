import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";

/** Default inbound lead time when a PO has no explicit delivery date. */
export const DEFAULT_INBOUND_LEAD_DAYS = 7;

export function incomingReceiptReference(poNumber: string, purchaseOrderItemId: string): string {
  return `INCOMING-${poNumber}-${purchaseOrderItemId}`;
}

function expectedArrivalFromPurchaseOrder(reviewedAt: Date | null, updatedAt: Date): Date {
  const base = reviewedAt ?? updatedAt;
  return new Date(base.getTime() + DEFAULT_INBOUND_LEAD_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Keeps OPEN InventoryReceipt rows aligned with approved PO lines so Materials MRP sees inbound supply.
 */
export async function syncIncomingReceiptsForPurchaseOrder(
  ctx: TenantContext,
  purchaseOrderId: string
): Promise<{ changed: boolean; summary: string }> {
  const prisma = getPrisma();
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId: ctx.tenantId },
    include: { items: { include: { product: { select: { sku: true } } } } },
  });
  if (!po || (po.status !== "APPROVED" && po.status !== "CLOSED")) {
    return { changed: false, summary: "" };
  }

  const warehouse = await prisma.warehouse.findFirst({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  const expectedAt = expectedArrivalFromPurchaseOrder(po.reviewedAt, po.updatedAt);

  const parts: string[] = [];
  let changed = false;

  for (const item of po.items) {
    const remaining = item.quantity - item.receivedQuantity;
    const reference = incomingReceiptReference(po.poNumber, item.id);
    const existing = await prisma.inventoryReceipt.findFirst({
      where: {
        tenantId: ctx.tenantId,
        purchaseOrderItemId: item.id,
        status: "OPEN",
      },
    });

    if (remaining <= 0) {
      if (existing) {
        await prisma.inventoryReceipt.update({
          where: { id: existing.id },
          data: { status: "CANCELLED", quantity: 0 },
        });
        changed = true;
        parts.push(`${item.product.sku} incoming cleared`);
      }
      continue;
    }

    if (existing) {
      const qtyChanged = existing.quantity !== remaining;
      const dateChanged = existing.expectedAt.getTime() !== expectedAt.getTime();
      if (qtyChanged || dateChanged) {
        await prisma.inventoryReceipt.update({
          where: { id: existing.id },
          data: {
            quantity: remaining,
            expectedAt,
            productId: item.productId,
            supplierId: po.supplierId,
          },
        });
        changed = true;
        parts.push(`${item.product.sku} ×${remaining} → ${expectedAt.toISOString().slice(0, 10)}`);
      }
      continue;
    }

    if (po.status !== "APPROVED") continue;

    await prisma.inventoryReceipt.create({
      data: {
        tenantId: ctx.tenantId,
        productId: item.productId,
        warehouseId: warehouse?.id ?? null,
        supplierId: po.supplierId,
        purchaseOrderId: po.id,
        purchaseOrderItemId: item.id,
        reference,
        quantity: remaining,
        status: "OPEN",
        expectedAt,
      },
    });
    changed = true;
    parts.push(`${item.product.sku} ×${remaining} expected ${expectedAt.toISOString().slice(0, 10)}`);
  }

  return {
    changed,
    summary: parts.length > 0 ? parts.join("; ") : po.poNumber,
  };
}
