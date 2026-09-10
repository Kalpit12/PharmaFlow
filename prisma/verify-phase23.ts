import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { detectIntent } from "../src/lib/ai/detect-intent";
import { INTENT_TOOLS } from "../src/lib/ai/context";
import type { TenantContext } from "../src/lib/server/errors";
import {
  approvePurchaseOrder,
  createPurchaseOrderFromRfq,
  getPurchaseOrderDetail,
  rejectPurchaseOrder,
  submitPurchaseOrderForApproval,
  updatePurchaseOrderDraft,
} from "../src/lib/server/purchase-orders";
import {
  awardProcurementRfqResponse,
  createProcurementRfqDraft,
  recordProcurementRfqResponse,
} from "../src/lib/server/procurement-rfqs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase23Verify(prisma: PrismaClient) {
  const sources = [
    readFileSync(join(process.cwd(), "src/lib/server/purchase-orders.ts"), "utf8"),
    readFileSync(join(process.cwd(), "src/components/purchase-orders/PoWorkspace.tsx"), "utf8"),
  ].join("\n");
  assert(!/openai/i.test(sources), "Phase 23 PO operations perform ZERO OpenAI calls");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const manager = await prisma.user.findFirst({ where: { tenantId: tenant?.id, role: "MANAGER" } });
  const viewer = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && manager && viewer, "Tenants and users required");

  const managerCtx: TenantContext = { tenantId: tenant.id, userId: manager.id, role: "MANAGER" };
  const viewerCtx: TenantContext = { tenantId: tenant.id, userId: viewer.id, role: "VIEWER" };
  const otherCtx: TenantContext = { tenantId: tenantB.id, userId: manager.id, role: "MANAGER" };

  const product = await prisma.product.findFirst({ where: { tenantId: tenant.id } });
  const supplier = await prisma.supplier.findFirst({ where: { tenantId: tenant.id, status: "ACTIVE" } });
  assert(product && supplier, "Product and supplier required");

  const lotsBefore = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const ordersBefore = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });

  const rfq = await createProcurementRfqDraft(managerCtx, {
    title: `PO verify RFQ ${Date.now()}`,
    items: [{ productId: product.id, quantity: 50 }],
    supplierIds: [supplier.id],
  });
  await prisma.procurementRfq.updateMany({ where: { id: rfq.id }, data: { status: "RESPONSES" } });
  const withResponse = await recordProcurementRfqResponse(managerCtx, rfq.id, {
    supplierId: supplier.id,
    currency: "KES",
    leadTimeDays: 7,
    items: [{ rfqItemId: rfq.items[0]!.id, quantity: 50, unitPrice: 100 }],
  });
  const awarded = await awardProcurementRfqResponse(managerCtx, rfq.id, withResponse.responses[0]!.id);
  assert(awarded.status === "AWARDED", "RFQ awarded for PO flow");
  const rfqBefore = await prisma.procurementRfq.findUnique({ where: { id: rfq.id } });

  let invalid = false;
  try {
    await createPurchaseOrderFromRfq(managerCtx, "00000000-0000-0000-0000-000000000099");
  } catch {
    invalid = true;
  }
  assert(invalid, "Invalid RFQ rejected");

  const po = await createPurchaseOrderFromRfq(managerCtx, rfq.id);
  assert(po.status === "DRAFT" && po.items.length === 1, "PO creation from awarded RFQ");
  assert(po.subtotal.includes("5,000") || po.subtotal.includes("5000"), "Server-side totals");

  const duplicate = await createPurchaseOrderFromRfq(managerCtx, rfq.id);
  assert(duplicate.id === po.id, "Duplicate PO prevention");

  const edited = await updatePurchaseOrderDraft(managerCtx, po.id, {
    notes: "Adjusted",
    items: [{ id: po.items[0]!.id, quantity: 40, unitPrice: 110 }],
  });
  assert(edited.items[0]?.quantity === 40, "DRAFT editing works");

  let editRejected = false;
  await submitPurchaseOrderForApproval(managerCtx, po.id);
  try {
    await updatePurchaseOrderDraft(managerCtx, po.id, {
      items: [{ id: po.items[0]!.id, quantity: 1, unitPrice: 1 }],
    });
  } catch {
    editRejected = true;
  }
  assert(editRejected, "Non-DRAFT editing rejected");

  let viewerApprove = false;
  try {
    await approvePurchaseOrder(viewerCtx, po.id);
  } catch {
    viewerApprove = true;
  }
  assert(viewerApprove, "Unauthorized role rejected");

  const approved = await approvePurchaseOrder(managerCtx, po.id);
  assert(approved.status === "APPROVED" && approved.reviewedByName, "Manager approval");
  const idempotent = await approvePurchaseOrder(managerCtx, po.id);
  assert(idempotent.status === "APPROVED", "Idempotent approval");

  let crossTenant = false;
  try {
    await getPurchaseOrderDetail(otherCtx, po.id);
  } catch {
    crossTenant = true;
  }
  assert(crossTenant, "Tenant isolation");

  const activity = await prisma.activity.findFirst({
    where: { tenantId: tenant.id, entityType: "PURCHASE_ORDER", entityId: po.id },
  });
  assert(activity, "Activity creation");

  const lotsAfter = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const ordersAfter = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  assert(lotsAfter === lotsBefore, "No inventory mutation");
  assert(ordersAfter === ordersBefore, "No production mutation");
  const rfqAfter = await prisma.procurementRfq.findUnique({ where: { id: rfq.id } });
  assert(rfqAfter?.status === "AWARDED" && rfqAfter.awardedResponseId === rfqBefore?.awardedResponseId, "No RFQ mutation");

  const intent = detectIntent(`Explain this purchase order purchase-order:${po.id}`);
  assert(intent.intent === "PURCHASE_ORDER", "PO AI intent");
  assert(INTENT_TOOLS.PURCHASE_ORDER.includes("get_purchase_order"), "PO AI tool mapping");

  const rejectRfq = await createProcurementRfqDraft(managerCtx, {
    title: `Reject PO RFQ ${Date.now()}`,
    items: [{ productId: product.id, quantity: 10 }],
    supplierIds: [supplier.id],
  });
  await prisma.procurementRfq.updateMany({ where: { id: rejectRfq.id }, data: { status: "RESPONSES" } });
  const rejectResponse = await recordProcurementRfqResponse(managerCtx, rejectRfq.id, {
    supplierId: supplier.id,
    currency: "KES",
    items: [{ rfqItemId: rejectRfq.items[0]!.id, quantity: 10, unitPrice: 50 }],
  });
  await awardProcurementRfqResponse(managerCtx, rejectRfq.id, rejectResponse.responses[0]!.id);
  const rejectPo = await createPurchaseOrderFromRfq(managerCtx, rejectRfq.id);
  await submitPurchaseOrderForApproval(managerCtx, rejectPo.id);
  const rejected = await rejectPurchaseOrder(managerCtx, rejectPo.id);
  assert(rejected.status === "REJECTED", "Rejection flow");

  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: [po.id, rejectPo.id] } } });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: [po.id, rejectPo.id] } } });
  await prisma.procurementRfq.deleteMany({ where: { id: { in: [rfq.id, rejectRfq.id] } } });

  console.log("Phase 23 verification passed.");
}
