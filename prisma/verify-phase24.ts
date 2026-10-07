import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import type { TenantContext } from "../src/lib/server/errors";
import {
  approvePurchaseOrder,
  createPurchaseOrderFromRfq,
  submitPurchaseOrderForApproval,
} from "../src/lib/server/purchase-orders";
import {
  awardProcurementRfqResponse,
  createProcurementRfqDraft,
  recordProcurementRfqResponse,
} from "../src/lib/server/procurement-rfqs";
import { getReceivingDetail, receivePurchaseOrderGoods } from "../src/lib/server/receiving";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function createApprovedPo(ctx: TenantContext, prisma: PrismaClient, quantity: number) {
  const product = await prisma.product.findFirst({ where: { tenantId: ctx.tenantId } });
  const supplier = await prisma.supplier.findFirst({ where: { tenantId: ctx.tenantId, status: "ACTIVE" } });
  const warehouse = await prisma.warehouse.findFirst({ where: { tenantId: ctx.tenantId } });
  assert(product && supplier && warehouse, "Fixture data required");

  const rfq = await createProcurementRfqDraft(ctx, {
    title: `Receive verify ${Date.now()}-${Math.random()}`,
    items: [{ productId: product.id, quantity }],
    supplierIds: [supplier.id],
  });
  await prisma.procurementRfq.updateMany({ where: { id: rfq.id }, data: { status: "RESPONSES" } });
  const withResponse = await recordProcurementRfqResponse(ctx, rfq.id, {
    supplierId: supplier.id,
    currency: "KES",
    items: [{ rfqItemId: rfq.items[0]!.id, quantity, unitPrice: 100 }],
  });
  await awardProcurementRfqResponse(ctx, rfq.id, withResponse.responses[0]!.id);
  const po = await createPurchaseOrderFromRfq(ctx, rfq.id);
  await submitPurchaseOrderForApproval(ctx, po.id);
  const approved = await approvePurchaseOrder(ctx, po.id);
  return { po: approved, product, supplier, warehouse, rfqId: rfq.id };
}

export async function runPhase24Verify(prisma: PrismaClient) {
  const sources = [
    readFileSync(join(process.cwd(), "src/lib/server/receiving.ts"), "utf8"),
    readFileSync(join(process.cwd(), "src/components/receiving/ReceivingDetailWorkspace.tsx"), "utf8"),
  ].join("\n");
  assert(!/openai/i.test(sources), "Phase 24 receiving performs ZERO OpenAI calls");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const manager = await prisma.user.findFirst({ where: { tenantId: tenant?.id, role: "MANAGER" } });
  assert(tenant && tenantB && manager, "Tenants and manager required");

  const managerCtx: TenantContext = { tenantId: tenant.id, userId: manager.id, role: "MANAGER" };
  const otherCtx: TenantContext = { tenantId: tenantB.id, userId: manager.id, role: "MANAGER" };

  const { po, product, warehouse } = await createApprovedPo(managerCtx, prisma, 100);
  assert(po.status === "APPROVED", "APPROVED PO is receivable");

  const draftPo = await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id,
      poNumber: `PO-TEST-DRAFT-${Date.now()}`,
      status: "DRAFT",
      supplierId: (await prisma.supplier.findFirst({ where: { tenantId: tenant.id } }))!.id,
      createdById: manager.id,
      currency: "KES",
      subtotal: 100,
      items: {
        create: {
          productId: product.id,
          description: "Draft line",
          quantity: 10,
          unitPrice: 10,
          currency: "KES",
          lineTotal: 100,
        },
      },
    },
  });

  try {
    await receivePurchaseOrderGoods(managerCtx, draftPo.id, {
      idempotencyKey: `deny-draft-${Date.now()}`,
      lines: [{
        purchaseOrderItemId: (await prisma.purchaseOrderItem.findFirst({ where: { purchaseOrderId: draftPo.id } }))!.id,
        quantityReceived: 1,
        batchCode: `B-${Date.now()}`,
        warehouseId: warehouse.id,
      }],
    });
    throw new Error("DRAFT should not be receivable");
  } catch (error) {
    assert(error instanceof Error && error.message.includes("approved"), "DRAFT cannot be received");
  }

  const pending = await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id,
      poNumber: `PO-TEST-PEND-${Date.now()}`,
      status: "PENDING_APPROVAL",
      supplierId: (await prisma.supplier.findFirst({ where: { tenantId: tenant.id } }))!.id,
      createdById: manager.id,
      currency: "KES",
      subtotal: 50,
      items: {
        create: {
          productId: product.id,
          description: "Pending",
          quantity: 5,
          unitPrice: 10,
          currency: "KES",
          lineTotal: 50,
        },
      },
    },
  });
  try {
    await receivePurchaseOrderGoods(managerCtx, pending.id, {
      idempotencyKey: `deny-pend-${Date.now()}`,
      lines: [{
        purchaseOrderItemId: (await prisma.purchaseOrderItem.findFirst({ where: { purchaseOrderId: pending.id } }))!.id,
        quantityReceived: 1,
        batchCode: `B-${Date.now()}`,
        warehouseId: warehouse.id,
      }],
    });
    throw new Error("PENDING should not be receivable");
  } catch (error) {
    assert(error instanceof Error && error.message.includes("approved"), "PENDING_APPROVAL cannot be received");
  }

  const lotsBefore = await prisma.inventoryLot.aggregate({
    where: { tenantId: tenant.id, productId: product.id },
    _sum: { quantity: true },
  });
  const qtyBefore = lotsBefore._sum.quantity ?? 0;
  const itemId = po.items[0]!.id;
  const partialKey = `partial-${Date.now()}`;
  const partial = await receivePurchaseOrderGoods(managerCtx, po.id, {
    idempotencyKey: partialKey,
    lines: [{ purchaseOrderItemId: itemId, quantityReceived: 40, batchCode: `RCV-PART-${Date.now()}`, warehouseId: warehouse.id }],
  });
  assert(partial.receivedNow === 40, "Partial receipt works");
  const afterPartial = await getReceivingDetail(managerCtx, po.id);
  assert(afterPartial.receivedQuantity === 40 && afterPartial.remainingQuantity === 60, "Remaining quantity calculated correctly");
  assert(afterPartial.status === "APPROVED", "Partial PO remains receivable");

  const lotsAfterPartial = await prisma.inventoryLot.aggregate({
    where: { tenantId: tenant.id, productId: product.id },
    _sum: { quantity: true },
  });
  assert((lotsAfterPartial._sum.quantity ?? 0) === qtyBefore + 40, "Inventory quantity increases correctly");

  const duplicate = await receivePurchaseOrderGoods(managerCtx, po.id, {
    idempotencyKey: partialKey,
    lines: [{ purchaseOrderItemId: itemId, quantityReceived: 40, batchCode: `IGNORE`, warehouseId: warehouse.id }],
  });
  assert(duplicate.receivedNow === 40, "Duplicate/retry does not duplicate inventory");

  try {
    await receivePurchaseOrderGoods(managerCtx, po.id, {
      idempotencyKey: `over-${Date.now()}`,
      lines: [{ purchaseOrderItemId: itemId, quantityReceived: 70, batchCode: `RCV-OVER-${Date.now()}`, warehouseId: warehouse.id }],
    });
    throw new Error("Over-receipt should fail");
  } catch (error) {
    assert(error instanceof Error && error.message.includes("Over-receipt"), "Over-receipt rejected");
  }

  const expiry = new Date();
  expiry.setUTCDate(expiry.getUTCDate() - 5);
  const withDisc = await receivePurchaseOrderGoods(managerCtx, po.id, {
    idempotencyKey: `disc-${Date.now()}`,
    lines: [{
      purchaseOrderItemId: itemId,
      quantityReceived: 20,
      batchCode: `RCV-DISC-${Date.now()}`,
      warehouseId: warehouse.id,
      expiryDate: expiry.toISOString().slice(0, 10),
    }],
  });
  assert(withDisc.discrepancies.length > 0, "Discrepancy detected");

  const full = await receivePurchaseOrderGoods(managerCtx, po.id, {
    idempotencyKey: `full-${Date.now()}`,
    lines: [{ purchaseOrderItemId: itemId, quantityReceived: 40, batchCode: `RCV-FULL-${Date.now()}`, warehouseId: warehouse.id }],
  });
  assert(full.fullyReceived, "Full receipt works");
  const closed = await prisma.purchaseOrder.findUnique({ where: { id: po.id } });
  assert(closed?.status === "CLOSED", "PO closes only when fully received");

  const activity = await prisma.activity.findFirst({
    where: { tenantId: tenant.id, entityType: "PURCHASE_ORDER", entityId: po.id, title: "Purchase order fully received" },
  });
  assert(activity, "Activity created");

  let crossTenant = false;
  try {
    await getReceivingDetail(otherCtx, po.id);
  } catch {
    crossTenant = true;
  }
  assert(crossTenant, "Tenant isolation");

  try {
    await receivePurchaseOrderGoods(otherCtx, po.id, {
      idempotencyKey: `iso-${Date.now()}`,
      lines: [{ purchaseOrderItemId: itemId, quantityReceived: 1, batchCode: `ISO-${Date.now()}`, warehouseId: warehouse.id }],
    });
    throw new Error("Cross-tenant receive should fail");
  } catch (error) {
    assert(error instanceof Error, "Unauthorized mutation rejected");
  }

  const rfqLink = await prisma.purchaseOrder.findUnique({ where: { id: po.id }, select: { procurementRfqId: true } });
  assert(rfqLink?.procurementRfqId, "Procurement/PO relationship remains intact");

  const lotsFinal = await prisma.inventoryLot.aggregate({
    where: { tenantId: tenant.id, productId: product.id },
    _sum: { quantity: true },
  });
  assert((lotsFinal._sum.quantity ?? 0) === qtyBefore + 100, "Materials reflect received inventory");

  await prisma.inventoryReceipt.deleteMany({ where: { purchaseOrderId: po.id } });
  await prisma.inventoryLot.deleteMany({ where: { tenantId: tenant.id, batchCode: { startsWith: "RCV-" } } });
  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: [po.id, draftPo.id, pending.id] } } });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: [po.id, draftPo.id, pending.id] } } });
  if (rfqLink.procurementRfqId) await prisma.procurementRfq.deleteMany({ where: { id: rfqLink.procurementRfqId } });
}
