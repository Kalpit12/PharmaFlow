import { Prisma } from "@prisma/client";

import { compareProcurementRfqResponses, formatResponseTotal, responseCompleteness } from "@/lib/procurement-rfq/compare";
import {
  PROCUREMENT_RFQ_VIEWS,
  type CompactProcurementRfqContext,
  type ProcurementRfqDetail,
  type ProcurementRfqListRow,
  type ProcurementRfqListSnapshot,
  type ProcurementRfqResponseView,
  type ProcurementRfqStatus,
  type ProcurementRfqSupplierOption,
  type ProcurementRfqViewId,
} from "@/lib/procurement-rfq/types";
import { suggestedProcurementQuantity } from "@/lib/procurement/recommendations";
import { canProcurementApprove, requirePermission } from "@/lib/auth/authorization";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";
import { formatCount } from "@/lib/server/money";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { getMaterialSupplierSnapshot } from "@/lib/server/suppliers";
import { findPurchaseOrderByRfq } from "@/lib/server/purchase-orders";
import { getTenant } from "@/lib/server/services/tenant";

export type ProcurementRfqFilters = {
  view: ProcurementRfqViewId;
  query?: string;
  status?: ProcurementRfqStatus;
};

function parseView(value?: string): ProcurementRfqViewId {
  return PROCUREMENT_RFQ_VIEWS.includes(value as ProcurementRfqViewId) ? (value as ProcurementRfqViewId) : "all";
}

export function resolveProcurementRfqFilters(input: { view?: string; status?: string; q?: string }): ProcurementRfqFilters {
  const view = parseView(input.view ?? input.status);
  return { view, query: input.q?.trim() || undefined };
}

function requireUser(ctx: TenantContext): string {
  if (!ctx.userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  return ctx.userId;
}

function requireReviewer(ctx: TenantContext): void {
  if (!canProcurementApprove(ctx.role)) throw new ServerError("You do not have permission to perform this action.", "FORBIDDEN");
}

async function nextReference(tenantId: string): Promise<string> {
  const count = await getPrisma().procurementRfq.count({ where: { tenantId } });
  return `PRFQ-${String(count + 1).padStart(5, "0")}`;
}

function statusForView(view: ProcurementRfqViewId): ProcurementRfqStatus | undefined {
  const map: Record<Exclude<ProcurementRfqViewId, "all">, ProcurementRfqStatus> = {
    draft: "DRAFT",
    review: "REVIEW",
    ready: "READY",
    responses: "RESPONSES",
    evaluation: "EVALUATION",
    awarded: "AWARDED",
    closed: "CLOSED",
  };
  return view === "all" ? undefined : map[view];
}

function mapResponseStatus(responses: ProcurementRfqResponseView[]): string {
  if (responses.some((row) => row.responseStatus === "AWARDED")) return "Awarded";
  if (responses.some((row) => row.responseStatus === "SUBMITTED")) return "Submitted";
  if (responses.length > 0) return "Draft";
  return "Awaiting";
}

function mapSupplierOptions(candidates: Awaited<ReturnType<typeof getMaterialSupplierSnapshot>>["candidates"]): ProcurementRfqSupplierOption[] {
  return candidates.map((row) => ({
    supplierId: row.supplierId,
    name: row.supplierName,
    code: row.supplierCode,
    status: row.status,
    preferred: row.preferred,
    leadTimeDays: row.leadTimeDays,
    unitPrice: row.unitPrice === null ? null : row.lastKnownPrice,
    currency: row.currency,
    recommendationReason: row.preferred
      ? "Preferred supplier for this material."
      : row.leadTimeDays !== null
        ? "Known lead time from supplier intelligence."
        : row.unitPrice !== null
          ? "Known unit price from supplier intelligence."
          : "Supplier linked to material.",
  }));
}

async function loadRfqDetail(ctx: TenantContext, id: string): Promise<ProcurementRfqDetail> {
  const prisma = getPrisma();
  const row = await prisma.procurementRfq.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      createdBy: { select: { name: true } },
      items: { include: { product: true } },
      suppliers: { include: { supplier: true, responses: { include: { items: { include: { rfqItem: { include: { product: true } } } } } } } },
      procurementRequisition: { select: { id: true, materialName: true } },
    },
  });
  if (!row) throw new ServerError("RFQ not found.", "NOT_FOUND");

  const supplierOptions: ProcurementRfqSupplierOption[] = [];
  if (row.items[0]) {
    const snapshot = await getMaterialSupplierSnapshot(ctx, row.items[0].productId);
    supplierOptions.push(...mapSupplierOptions(snapshot.candidates));
  }
  const optionById = new Map(supplierOptions.map((opt) => [opt.supplierId, opt]));
  const invitedSuppliers = row.suppliers.map((supplierRow) => {
    const intel = optionById.get(supplierRow.supplierId);
    return {
      id: supplierRow.id,
      supplierId: supplierRow.supplierId,
      name: supplierRow.supplier.name,
      code: supplierRow.supplier.code,
      status: supplierRow.supplier.status,
      invitationStatus: supplierRow.status,
      preferred: intel?.preferred ?? false,
      leadTimeDays: intel?.leadTimeDays ?? null,
      unitPrice: intel?.unitPrice ?? null,
    };
  });
  const invitedIds = new Set(row.suppliers.map((s) => s.supplierId));
  const availableSuppliers = supplierOptions.filter((opt) => !invitedIds.has(opt.supplierId));

  const responses: ProcurementRfqResponseView[] = row.suppliers.flatMap((supplierRow) =>
    supplierRow.responses.map((response) => {
      const items = response.items.map((item) => {
        const lineTotal =
          item.unitPrice !== null
            ? `${response.currency ?? ""} ${(Number(item.unitPrice) * item.quantity).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`.trim()
            : null;
        return {
          id: item.id,
          rfqItemId: item.rfqItemId,
          productName: item.rfqItem.product.name,
          sku: item.rfqItem.product.sku,
          requestedQuantity: item.rfqItem.quantity,
          quotedQuantity: item.quantity,
          unitPrice: item.unitPrice ? Number(item.unitPrice).toLocaleString("en-KE", { maximumFractionDigits: 2 }) : null,
          lineTotal,
          notes: item.notes,
        };
      });
      const view: ProcurementRfqResponseView = {
        id: response.id,
        supplierId: supplierRow.supplierId,
        supplierName: supplierRow.supplier.name,
        supplierStatus: supplierRow.supplier.status,
        responseStatus: response.responseStatus,
        quotedAt: response.quotedAt?.toISOString() ?? null,
        currency: response.currency,
        totalAmount: response.totalAmount ? Number(response.totalAmount).toLocaleString("en-KE", { maximumFractionDigits: 2 }) : null,
        leadTimeDays: response.leadTimeDays,
        notes: response.notes,
        completeness: responseCompleteness({ items } as ProcurementRfqResponseView).label,
        items,
      };
      return view;
    })
  );

  const comparison = compareProcurementRfqResponses(responses);
  const linkedPurchaseOrder = await findPurchaseOrderByRfq(ctx, id);

  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    status: row.status as ProcurementRfqStatus,
    dueDate: row.dueDate?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdBy.name,
    procurementSourceHref: row.procurementRequisitionId ? `/procurement?requisition=${row.procurementRequisitionId}` : null,
    procurementSourceLabel: row.procurementRequisition ? `From procurement · ${row.procurementRequisition.materialName}` : null,
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unit: item.unit,
      notes: item.notes,
    })),
    invitedSuppliers,
    suppliers: availableSuppliers,
    responses,
    comparison: comparison.rows,
    currencyComparable: comparison.currencyComparable,
    evaluationSummary: comparison.evaluationSummary,
    awardedResponseId: row.awardedResponseId,
    canAward: canProcurementApprove(ctx.role) && (row.status === "EVALUATION" || row.status === "RESPONSES") && !row.awardedResponseId,
    canReview: canProcurementApprove(ctx.role),
    linkedPurchaseOrder: linkedPurchaseOrder
      ? { id: linkedPurchaseOrder.id, poNumber: linkedPurchaseOrder.poNumber, status: linkedPurchaseOrder.status }
      : null,
  };
}

export async function getProcurementRfqListSnapshot(ctx: TenantContext, filters: ProcurementRfqFilters): Promise<ProcurementRfqListSnapshot> {
  const tenant = await getTenant(ctx);
  const prisma = getPrisma();
  const status = statusForView(filters.view);
  const query = filters.query?.toLowerCase();

  const rows = await prisma.procurementRfq.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
    },
    include: {
      items: { include: { product: true } },
      suppliers: { include: { supplier: true, responses: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const mapped: ProcurementRfqListRow[] = rows
    .map((row) => {
      const responses = row.suppliers.flatMap((supplier) => supplier.responses);
      const responseViews: ProcurementRfqResponseView[] = responses.map((response) => ({
        id: response.id,
        supplierId: "",
        supplierName: "",
        supplierStatus: "",
        responseStatus: response.responseStatus,
        quotedAt: response.quotedAt?.toISOString() ?? null,
        currency: response.currency,
        totalAmount: response.totalAmount ? Number(response.totalAmount).toLocaleString("en-KE") : null,
        leadTimeDays: response.leadTimeDays,
        notes: response.notes,
        completeness: "—",
        items: [],
      }));
      return {
        id: row.id,
        reference: row.reference,
        title: row.title,
        status: row.status as ProcurementRfqStatus,
        itemsLabel: row.items.map((item) => item.product.name).join(", ") || "—",
        supplierCount: row.suppliers.length,
        quantityLabel: row.items.map((item) => `${item.quantity} ${item.unit}`).join(" · ") || "—",
        responseStatus: mapResponseStatus(responseViews),
        dueDate: row.dueDate?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    })
    .filter((row) => {
      if (!query) return true;
      return (
        row.reference.toLowerCase().includes(query) ||
        row.title.toLowerCase().includes(query) ||
        row.itemsLabel.toLowerCase().includes(query)
      );
    });

  const all = await prisma.procurementRfq.findMany({ where: { tenantId: ctx.tenantId }, select: { status: true } });
  const count = (statusValue: ProcurementRfqStatus) => formatCount(all.filter((row) => row.status === statusValue).length);

  return {
    brand: tenant.name,
    disclaimer: tenant.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: new Date().toISOString(),
    view: filters.view,
    kpis: [
      { id: "draft", label: "Draft", value: count("DRAFT") },
      { id: "review", label: "Awaiting review", value: count("REVIEW") },
      { id: "responses", label: "Awaiting responses", value: count("RESPONSES") },
      { id: "evaluation", label: "Evaluation", value: count("EVALUATION") },
      { id: "awarded", label: "Awarded", value: count("AWARDED") },
      { id: "total", label: "Total RFQs", value: formatCount(all.length) },
    ],
    rows: mapped,
    emptyReason: mapped.length === 0 ? "No procurement RFQs yet. Create one from procurement or start a new draft." : null,
    planningNote: "Internal RFQ lifecycle only. No supplier messages, purchase orders, or inventory changes are created.",
  };
}

export async function getProcurementRfqDetail(ctx: TenantContext, id: string): Promise<ProcurementRfqDetail> {
  return loadRfqDetail(ctx, id);
}

export async function createProcurementRfqDraft(
  ctx: TenantContext,
  input: { title: string; dueDate?: string | null; notes?: string | null; items: Array<{ productId: string; quantity: number; notes?: string }>; supplierIds?: string[] }
): Promise<ProcurementRfqDetail> {
  const userId = requireUser(ctx);
  const prisma = getPrisma();
  if (!input.title.trim() || input.items.length === 0) throw new ServerError("Title and at least one item are required.", "INTERNAL");

  const products = await prisma.product.findMany({
    where: { tenantId: ctx.tenantId, id: { in: input.items.map((row) => row.productId) } },
    select: { id: true, unit: true },
  });
  if (products.length !== input.items.length) throw new ServerError("One or more materials were not found.", "NOT_FOUND");

  const unitById = new Map(products.map((row) => [row.id, row.unit ?? "unit"]));
  const reference = await nextReference(ctx.tenantId);
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) throw new ServerError("Invalid due date.", "INTERNAL");

  const supplierIds = [...new Set(input.supplierIds ?? [])];
  if (supplierIds.length > 0) {
    const count = await prisma.supplier.count({ where: { tenantId: ctx.tenantId, id: { in: supplierIds } } });
    if (count !== supplierIds.length) throw new ServerError("One or more suppliers were not found.", "NOT_FOUND");
  }

  const created = await prisma.procurementRfq.create({
    data: {
      tenantId: ctx.tenantId,
      reference,
      title: input.title.trim(),
      status: "DRAFT",
      createdById: userId,
      dueDate,
      notes: input.notes?.trim() || null,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unit: unitById.get(item.productId) ?? "unit",
          notes: item.notes?.trim() || null,
        })),
      },
      suppliers: supplierIds.length
        ? { create: supplierIds.map((supplierId) => ({ supplierId, status: "INVITED" })) }
        : undefined,
    },
  });

  return loadRfqDetail(ctx, created.id);
}

export async function createProcurementRfqFromRecommendation(
  ctx: TenantContext,
  input: { productId: string; requisitionId?: string }
): Promise<ProcurementRfqDetail> {
  const materials = await getMaterialsSnapshot(ctx, resolveMaterialsFilters({ material: input.productId }));
  const material = materials.materials.find((row) => row.productId === input.productId);
  if (!material) throw new ServerError("Material not found.", "NOT_FOUND");

  const supplierSnapshot = await getMaterialSupplierSnapshot(ctx, input.productId);
  const quantity = suggestedProcurementQuantity(material);
  const title = `RFQ · ${material.name}`;
  const draft = await createProcurementRfqDraft(ctx, {
    title,
    dueDate: material.earliestDueDate,
    notes: `Created from procurement recommendation. ${material.attention ?? "Planning only."}`,
    items: [{ productId: material.productId, quantity, notes: material.attention ?? undefined }],
    supplierIds: supplierSnapshot.candidates.slice(0, 3).map((row) => row.supplierId),
  });

  if (input.requisitionId) {
    await getPrisma().procurementRfq.updateMany({
      where: { id: draft.id, tenantId: ctx.tenantId },
      data: { procurementRequisitionId: input.requisitionId },
    });
  }

  return loadRfqDetail(ctx, draft.id);
}

export async function updateProcurementRfqStatus(ctx: TenantContext, id: string, status: ProcurementRfqStatus): Promise<ProcurementRfqDetail> {
  const prisma = getPrisma();
  const current = await prisma.procurementRfq.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!current) throw new ServerError("RFQ not found.", "NOT_FOUND");
  if (status === "REVIEW" || status === "READY" || status === "CANCELLED") requireReviewer(ctx);
  if (status === "CLOSED" && current.status !== "AWARDED") throw new ServerError("Only awarded RFQs can be closed.", "INTERNAL");

  await prisma.procurementRfq.updateMany({
    where: { id, tenantId: ctx.tenantId },
    data: { status },
  });
  return loadRfqDetail(ctx, id);
}

export async function recordProcurementRfqResponse(
  ctx: TenantContext,
  rfqId: string,
  input: {
    supplierId: string;
    currency?: string;
    leadTimeDays?: number | null;
    quotedAt?: string | null;
    notes?: string | null;
    items: Array<{ rfqItemId: string; quantity: number; unitPrice?: number | null; notes?: string | null }>;
  }
): Promise<ProcurementRfqDetail> {
  requireUser(ctx);
  const prisma = getPrisma();
  const rfq = await prisma.procurementRfq.findFirst({
    where: { id: rfqId, tenantId: ctx.tenantId },
    include: { items: true, suppliers: true },
  });
  if (!rfq) throw new ServerError("RFQ not found.", "NOT_FOUND");
  if (rfq.status === "AWARDED" || rfq.status === "CLOSED" || rfq.status === "CANCELLED") {
    throw new ServerError("Responses cannot be changed after award or closure.", "INTERNAL");
  }

  const supplierRow = rfq.suppliers.find((row) => row.supplierId === input.supplierId);
  let rfqSupplierId = supplierRow?.id;
  if (!rfqSupplierId) {
    const exists = await prisma.supplier.findFirst({ where: { id: input.supplierId, tenantId: ctx.tenantId } });
    if (!exists) throw new ServerError("Supplier not found.", "NOT_FOUND");
    const createdSupplier = await prisma.procurementRfqSupplier.create({
      data: { rfqId, supplierId: input.supplierId, status: "INVITED" },
    });
    rfqSupplierId = createdSupplier.id;
  }

  const itemIds = new Set(rfq.items.map((row) => row.id));
  for (const item of input.items) {
    if (!itemIds.has(item.rfqItemId)) throw new ServerError("Invalid RFQ item.", "INTERNAL");
  }

  const currency = input.currency?.trim().toUpperCase() || null;
  const quotedAt = input.quotedAt ? new Date(input.quotedAt) : new Date();
  const total = formatResponseTotal(
    input.items.map((row) => ({
      unitPrice: row.unitPrice === null || row.unitPrice === undefined ? null : String(row.unitPrice),
      quotedQuantity: row.quantity,
    })),
    currency
  );

  const response = await prisma.procurementRfqResponse.create({
    data: {
      rfqSupplierId,
      responseStatus: "SUBMITTED",
      quotedAt,
      currency,
      totalAmount: total ? new Prisma.Decimal(total.replace(/[^\d.-]/g, "")) : null,
      leadTimeDays: input.leadTimeDays ?? null,
      notes: input.notes?.trim() || null,
      items: {
        create: input.items.map((item) => ({
          rfqItemId: item.rfqItemId,
          quantity: item.quantity,
          unitPrice: item.unitPrice === null || item.unitPrice === undefined ? null : new Prisma.Decimal(item.unitPrice),
          notes: item.notes?.trim() || null,
        })),
      },
    },
  });

  await prisma.procurementRfqSupplier.updateMany({
    where: { id: rfqSupplierId },
    data: { status: "RESPONDED" },
  });
  await prisma.procurementRfq.updateMany({
    where: { id: rfqId, tenantId: ctx.tenantId, status: { in: ["READY", "RESPONSES"] } },
    data: { status: "EVALUATION" },
  });

  return loadRfqDetail(ctx, rfqId);
}

export async function awardProcurementRfqResponse(ctx: TenantContext, rfqId: string, responseId: string): Promise<ProcurementRfqDetail> {
  requireReviewer(ctx);
  const prisma = getPrisma();
  const rfq = await prisma.procurementRfq.findFirst({
    where: { id: rfqId, tenantId: ctx.tenantId },
    include: { suppliers: { include: { responses: true } } },
  });
  if (!rfq) throw new ServerError("RFQ not found.", "NOT_FOUND");
  if (rfq.awardedResponseId === responseId) return loadRfqDetail(ctx, rfqId);

  const belongs = rfq.suppliers.some((supplier) => supplier.responses.some((response) => response.id === responseId));
  if (!belongs) throw new ServerError("Response not found on this RFQ.", "NOT_FOUND");

  const supplierIds = rfq.suppliers.map((row) => row.id);
  const otherResponseIds = rfq.suppliers
    .flatMap((supplier) => supplier.responses.map((response) => response.id))
    .filter((id) => id !== responseId);

  await prisma.$transaction([
    prisma.procurementRfqResponse.updateMany({ where: { id: responseId }, data: { responseStatus: "AWARDED" } }),
    ...(otherResponseIds.length
      ? [prisma.procurementRfqResponse.updateMany({ where: { id: { in: otherResponseIds } }, data: { responseStatus: "REJECTED" } })]
      : []),
    prisma.procurementRfqSupplier.updateMany({
      where: { rfqId, responses: { some: { id: responseId } } },
      data: { status: "AWARDED" },
    }),
    prisma.procurementRfqSupplier.updateMany({
      where: { id: { in: supplierIds }, responses: { none: { id: responseId } } },
      data: { status: "RESPONDED" },
    }),
    prisma.procurementRfq.updateMany({
      where: { id: rfqId, tenantId: ctx.tenantId },
      data: { status: "AWARDED", awardedResponseId: responseId },
    }),
  ]);

  return loadRfqDetail(ctx, rfqId);
}

export function toCompactProcurementRfqContext(detail: ProcurementRfqDetail): CompactProcurementRfqContext {
  return {
    reference: detail.reference,
    title: detail.title,
    status: detail.status,
    items: detail.items.map((row) => ({ name: row.name, quantity: row.quantity, unit: row.unit })),
    suppliers: detail.suppliers.slice(0, 5).map((row) => ({
      name: row.name,
      preferred: row.preferred,
      leadTime: row.leadTimeDays === null ? "Not available" : `${row.leadTimeDays} days`,
      price: row.unitPrice ?? "Not available",
    })),
    comparison: detail.comparison.slice(0, 5).map((row) => ({
      supplier: row.supplierName,
      total: row.total,
      leadTime: row.leadTime,
      completeness: row.completeness,
      reasoning: row.reasoning,
    })),
    evaluationSummary: detail.evaluationSummary,
  };
}

export async function countProcurementRfqsAwaitingEvaluation(ctx: TenantContext): Promise<number> {
  return getPrisma().procurementRfq.count({ where: { tenantId: ctx.tenantId, status: "EVALUATION" } });
}

export async function getProcurementRfqFormOptions(ctx: TenantContext) {
  const prisma = getPrisma();
  const [products, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, sku: true, unit: true },
      orderBy: { name: "asc" },
      take: 80,
    }),
    prisma.supplier.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, code: true, status: true },
      orderBy: { name: "asc" },
      take: 80,
    }),
  ]);
  return { products, suppliers };
}

export async function getProcurementRfqReportMetrics(ctx: TenantContext) {
  const prisma = getPrisma();
  const rows = await prisma.procurementRfq.findMany({
    where: { tenantId: ctx.tenantId },
    include: { suppliers: { include: { responses: true } } },
  });
  const awaitingResponse = rows.filter((row) => row.status === "RESPONSES" || row.status === "READY").length;
  const evaluation = rows.filter((row) => row.status === "EVALUATION").length;
  const awarded = rows.filter((row) => row.status === "AWARDED").length;
  const withResponses = rows.filter((row) => row.suppliers.some((s) => s.responses.length > 0)).length;
  const leadTimes = rows.flatMap((row) =>
    row.suppliers.flatMap((s) => s.responses.map((r) => r.leadTimeDays).filter((d): d is number => d !== null))
  );
  const avgLead =
    leadTimes.length > 0 ? Math.round(leadTimes.reduce((sum, d) => sum + d, 0) / leadTimes.length) : null;
  const currencies = new Set(
    rows.flatMap((row) => row.suppliers.flatMap((s) => s.responses.map((r) => r.currency).filter(Boolean)))
  );
  const quotedValue =
    currencies.size === 1
      ? rows
          .flatMap((row) => row.suppliers.flatMap((s) => s.responses))
          .reduce((sum, r) => sum + Number(r.totalAmount ?? 0), 0)
      : null;
  return {
    total: rows.length,
    awaitingResponse,
    evaluation,
    awarded,
    responseCoverage: rows.length > 0 ? Math.round((withResponses / rows.length) * 100) : 0,
    averageLeadTimeDays: avgLead,
    quotedValue,
    quotedCurrency: currencies.size === 1 ? [...currencies][0] ?? null : null,
  };
}
