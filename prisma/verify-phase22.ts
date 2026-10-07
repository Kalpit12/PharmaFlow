import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { detectIntent } from "../src/lib/ai/detect-intent";
import { INTENT_TOOLS } from "../src/lib/ai/context";
import { compareProcurementRfqResponses } from "../src/lib/procurement-rfq/compare";
import type { TenantContext } from "../src/lib/server/errors";
import {
  awardProcurementRfqResponse,
  createProcurementRfqDraft,
  getProcurementRfqDetail,
  getProcurementRfqListSnapshot,
  recordProcurementRfqResponse,
  resolveProcurementRfqFilters,
  toCompactProcurementRfqContext,
} from "../src/lib/server/procurement-rfqs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase22Verify(prisma: PrismaClient) {
  const sources = [
    readFileSync(join(process.cwd(), "src/lib/server/procurement-rfqs.ts"), "utf8"),
    readFileSync(join(process.cwd(), "src/components/procurement-rfq/RfqWorkspace.tsx"), "utf8"),
    readFileSync(join(process.cwd(), "src/components/procurement-rfq/RfqDetailWorkspace.tsx"), "utf8"),
    readFileSync(join(process.cwd(), "src/lib/procurement-rfq/compare.ts"), "utf8"),
  ].join("\n");
  assert(!/openai/i.test(sources), "Phase 22 RFQ calculations perform ZERO OpenAI calls");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const manager = await prisma.user.findFirst({ where: { tenantId: tenant?.id, role: "MANAGER" } });
  const staff = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && manager && staff, "Tenants and users required");

  const managerCtx: TenantContext = { tenantId: tenant.id, userId: manager.id, role: "MANAGER" };
  const staffCtx: TenantContext = { tenantId: tenant.id, userId: staff.id, role: "VIEWER" };
  const otherCtx: TenantContext = { tenantId: tenantB.id, userId: manager.id, role: "MANAGER" };

  const product = await prisma.product.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
  const supplierA = await prisma.supplier.findFirst({ where: { tenantId: tenant.id, status: "ACTIVE" } });
  const supplierB = await prisma.supplier.findFirst({
    where: { tenantId: tenant.id, status: "ACTIVE", NOT: { id: supplierA?.id } },
  });
  assert(product && supplierA && supplierB, "Product and suppliers required");

  const ordersBefore = await prisma.order.count({ where: { tenantId: tenant.id } });
  const lotsBefore = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const reqsBefore = await prisma.procurementRequisition.count({ where: { tenantId: tenant.id } });

  const draft = await createProcurementRfqDraft(managerCtx, {
    title: `Verify RFQ ${Date.now()}`,
    dueDate: "2026-12-01",
    notes: "Phase 22 verification",
    items: [{ productId: product.id, quantity: 100 }],
    supplierIds: [supplierA.id, supplierB.id],
  });
  assert(draft.status === "DRAFT", "RFQ creation starts in DRAFT");
  assert(draft.items.length === 1 && draft.invitedSuppliers.length === 2, "RFQ item and supplier relationships");

  const list = await getProcurementRfqListSnapshot(managerCtx, resolveProcurementRfqFilters({ view: "draft" }));
  assert(list.rows.some((row) => row.id === draft.id), "RFQ list snapshot includes created RFQ");

  await prisma.procurementRfq.updateMany({
    where: { id: draft.id, tenantId: tenant.id },
    data: { status: "RESPONSES" },
  });

  const withResponse = await recordProcurementRfqResponse(managerCtx, draft.id, {
    supplierId: supplierA.id,
    currency: "KES",
    leadTimeDays: 10,
    items: [{ rfqItemId: draft.items[0]!.id, quantity: 100, unitPrice: 50 }],
  });
  assert(withResponse.responses.length === 1, "Response creation works");
  assert(withResponse.status === "EVALUATION", "Response moves RFQ to evaluation");

  const incomplete = compareProcurementRfqResponses([
    {
      id: "r1",
      supplierId: supplierA.id,
      supplierName: supplierA.name,
      supplierStatus: "ACTIVE",
      responseStatus: "SUBMITTED",
      quotedAt: null,
      currency: "KES",
      totalAmount: null,
      leadTimeDays: null,
      notes: null,
      completeness: "—",
      items: [],
    },
  ]);
  assert(incomplete.evaluationSummary.includes("incomplete"), "Incomplete response handling");

  const mismatch = compareProcurementRfqResponses([
    {
      id: "r1",
      supplierId: supplierA.id,
      supplierName: "A",
      supplierStatus: "ACTIVE",
      responseStatus: "SUBMITTED",
      quotedAt: null,
      currency: "KES",
      totalAmount: "1,000",
      leadTimeDays: 5,
      notes: null,
      completeness: "Complete",
      items: [{ id: "i1", rfqItemId: "x", productName: "P", sku: "S", requestedQuantity: 1, quotedQuantity: 1, unitPrice: "10", lineTotal: "10", notes: null }],
    },
    {
      id: "r2",
      supplierId: supplierB.id,
      supplierName: "B",
      supplierStatus: "ACTIVE",
      responseStatus: "SUBMITTED",
      quotedAt: null,
      currency: "USD",
      totalAmount: "100",
      leadTimeDays: 7,
      notes: null,
      completeness: "Complete",
      items: [{ id: "i2", rfqItemId: "x", productName: "P", sku: "S", requestedQuantity: 1, quotedQuantity: 1, unitPrice: "10", lineTotal: "10", notes: null }],
    },
  ]);
  assert(!mismatch.currencyComparable, "Currency mismatch handling");
  assert(mismatch.evaluationSummary.toLowerCase().includes("currency"), "Currency mismatch message");

  let forbidden = false;
  try {
    await awardProcurementRfqResponse(staffCtx, draft.id, withResponse.responses[0]!.id);
  } catch {
    forbidden = true;
  }
  assert(forbidden, "Award role restriction for non-manager");

  const awarded = await awardProcurementRfqResponse(managerCtx, draft.id, withResponse.responses[0]!.id);
  assert(awarded.status === "AWARDED" && awarded.awardedResponseId === withResponse.responses[0]!.id, "Award works");
  const idempotent = await awardProcurementRfqResponse(managerCtx, draft.id, withResponse.responses[0]!.id);
  assert(idempotent.status === "AWARDED", "Award idempotency");

  let crossTenant = false;
  try {
    await getProcurementRfqDetail(otherCtx, draft.id);
  } catch {
    crossTenant = true;
  }
  assert(crossTenant, "Tenant isolation on detail");

  const emptyOther = await getProcurementRfqListSnapshot(otherCtx, resolveProcurementRfqFilters({ view: "all" }));
  assert(!emptyOther.rows.some((row) => row.id === draft.id), "Empty tenant behavior / isolation on list");

  const supplierNameBefore = (await prisma.supplier.findUnique({ where: { id: supplierA.id } }))?.name;
  assert(supplierNameBefore, "Supplier still exists");

  const ordersAfter = await prisma.order.count({ where: { tenantId: tenant.id } });
  const lotsAfter = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const reqsAfter = await prisma.procurementRequisition.count({ where: { tenantId: tenant.id } });
  assert(ordersAfter === ordersBefore, "No automatic PO creation");
  assert(lotsAfter === lotsBefore, "No inventory mutation");
  assert(reqsAfter === reqsBefore, "No procurement mutation");

  const supplierAfter = await prisma.supplier.findUnique({ where: { id: supplierA.id } });
  assert(supplierAfter?.name === supplierNameBefore, "No supplier mutation");

  const compact = toCompactProcurementRfqContext(awarded);
  assert(!JSON.stringify(compact).includes(tenant.id), "Compact AI context excludes tenant UUID");

  const intent = detectIntent(`Analyze RFQ procurement-rfq:${draft.id}`);
  assert(intent.intent === "PROCUREMENT_RFQ", "AI intent for analyze RFQ");
  assert(INTENT_TOOLS.PROCUREMENT_RFQ.includes("get_procurement_rfq"), "Procurement RFQ AI tool mapping");

  await prisma.procurementRfq.deleteMany({ where: { id: draft.id, tenantId: tenant.id } });

  console.log("Phase 22 verification passed.");
}
