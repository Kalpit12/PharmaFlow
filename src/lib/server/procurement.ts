import { Prisma } from "@prisma/client";

import type { AffectedProductionOrder, MaterialRisk } from "@/lib/materials/types";
import {
  buildProcurementRecommendations,
  isProcurementRecommendation,
  PROCUREMENT_RECOMMENDATION_RISKS,
  procurementRecommendationReason,
  suggestedProcurementQuantity,
} from "@/lib/procurement/recommendations";
import {
  PROCUREMENT_VIEWS,
  type ProcurementRequisitionDetail,
  type ProcurementRequisitionStatus,
  type ProcurementSnapshot,
  type ProcurementViewId,
} from "@/lib/procurement/types";
import { canProcurementApprove, requirePermission } from "@/lib/auth/authorization";
import { formatStateChange, writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";
import { formatCount } from "@/lib/server/money";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { getMaterialSupplierSnapshot } from "@/lib/server/suppliers";

export type ProcurementFilters = {
  view: ProcurementViewId;
  risk?: MaterialRisk;
  query?: string;
  materialId?: string;
  orderId?: string;
};

function parseView(value?: string): ProcurementViewId {
  return PROCUREMENT_VIEWS.includes(value as ProcurementViewId) ? (value as ProcurementViewId) : "all";
}

function parseRisk(value?: string): MaterialRisk | undefined {
  return PROCUREMENT_RECOMMENDATION_RISKS.includes(value as MaterialRisk) || value === "LOW"
    ? (value as MaterialRisk)
    : undefined;
}

export function resolveProcurementFilters(input: {
  view?: string;
  risk?: string;
  q?: string;
  material?: string;
  order?: string;
}): ProcurementFilters {
  return {
    view: parseView(input.view),
    risk: parseRisk(input.risk),
    query: input.q?.trim() || undefined,
    materialId: input.material?.trim() || undefined,
    orderId: input.order?.trim() || undefined,
  };
}

function requireUser(ctx: TenantContext): string {
  if (!ctx.userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  return ctx.userId;
}

type RequisitionRow = {
  id: string;
  productId: string;
  status: ProcurementRequisitionStatus;
  quantity: number;
  reason: string;
  risk: string;
  materialSku: string;
  materialName: string;
  materialUnit: string;
  grossRequirement: number;
  available: number;
  incoming: number;
  projectedAvailable: number;
  netRequirement: number;
  earliestDueDate: Date | null;
  affectedOrders: AffectedProductionOrder[];
  createdAt: Date;
  reviewedAt: Date | null;
  createdByName: string;
  reviewedByName: string | null;
};

async function loadRequisitions(tenantId: string): Promise<RequisitionRow[]> {
  const prisma = getPrisma();
  try {
    const rows = await prisma.procurementRequisition.findMany({
      where: { tenantId },
      include: {
        createdBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      status: row.status as ProcurementRequisitionStatus,
      quantity: row.quantity,
      reason: row.reason,
      risk: row.risk,
      materialSku: row.materialSku,
      materialName: row.materialName,
      materialUnit: row.materialUnit,
      grossRequirement: Number(row.grossRequirement),
      available: row.available,
      incoming: row.incoming,
      projectedAvailable: Number(row.projectedAvailable),
      netRequirement: row.netRequirement,
      earliestDueDate: row.earliestDueDate,
      affectedOrders: row.affectedOrders as AffectedProductionOrder[],
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt,
      createdByName: row.createdBy.name,
      reviewedByName: row.reviewedBy?.name ?? null,
    }));
  } catch {
    return [];
  }
}

function draftLookup(requisitions: RequisitionRow[]): Map<string, RequisitionRow> {
  const map = new Map<string, RequisitionRow>();
  for (const row of requisitions) {
    if (row.status === "DRAFT" && !map.has(row.productId)) map.set(row.productId, row);
  }
  return map;
}

function filterRows(
  rows: ReturnType<typeof buildProcurementRecommendations>,
  filters: ProcurementFilters
): ReturnType<typeof buildProcurementRecommendations> {
  const query = filters.query?.toLowerCase();
  return rows.filter((row) => {
    if (filters.risk && row.risk !== filters.risk) return false;
    if (filters.materialId && row.productId !== filters.materialId) return false;
    if (filters.orderId && !row.affectedOrders.some((order) => order.id === filters.orderId)) return false;
    if (query && !row.sku.toLowerCase().includes(query) && !row.name.toLowerCase().includes(query)) return false;
    if (filters.view === "critical" && row.risk !== "CRITICAL") return false;
    if (filters.view === "needs-review" && row.rowStatus !== "DRAFT" && row.rowStatus !== "RECOMMENDATION") return false;
    if (filters.view === "reviewed" && row.rowStatus !== "REVIEWED") return false;
    if (filters.view === "rejected" && row.rowStatus !== "REJECTED") return false;
    return true;
  });
}

export async function getProcurementSnapshot(ctx: TenantContext, filters: ProcurementFilters): Promise<ProcurementSnapshot> {
  const [materialsSnapshot, requisitions] = await Promise.all([
    getMaterialsSnapshot(ctx, resolveMaterialsFilters({ view: "requirements" })),
    loadRequisitions(ctx.tenantId),
  ]);

  const drafts = draftLookup(requisitions);
  const lookup = new Map<
    string,
    {
      id: string;
      status: "DRAFT" | "REVIEWED" | "REJECTED";
      createdByName: string | null;
      createdAt: string | null;
      reviewedByName: string | null;
      reviewedAt: string | null;
    }
  >();

  for (const row of requisitions) {
    const existing = lookup.get(row.productId);
    if (row.status === "DRAFT") {
      lookup.set(row.productId, {
        id: row.id,
        status: "DRAFT",
        createdByName: row.createdByName,
        createdAt: row.createdAt.toISOString(),
        reviewedByName: null,
        reviewedAt: null,
      });
      continue;
    }
    if (!existing || existing.status !== "DRAFT") {
      lookup.set(row.productId, {
        id: row.id,
        status: row.status,
        createdByName: row.createdByName,
        createdAt: row.createdAt.toISOString(),
        reviewedByName: row.reviewedByName,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
      });
    }
  }

  const allRecommendations = buildProcurementRecommendations(materialsSnapshot.materials, lookup);

  const recommendationProductIds = new Set(allRecommendations.map((row) => row.productId));
  const requisitionOnlyRows: ReturnType<typeof buildProcurementRecommendations> = [];
  for (const row of requisitions) {
    if (recommendationProductIds.has(row.productId)) continue;
    if (row.status !== "REVIEWED" && row.status !== "REJECTED") continue;
    requisitionOnlyRows.push({
      productId: row.productId,
      sku: row.materialSku,
      name: row.materialName,
      unit: row.materialUnit,
      risk: row.risk as MaterialRisk,
      grossRequirement: row.grossRequirement,
      available: row.available,
      incoming: row.incoming,
      projectedAvailable: row.projectedAvailable,
      netRequirement: row.netRequirement,
      shortage: row.netRequirement > 0,
      suggestedQuantity: row.quantity,
      affectedOrders: row.affectedOrders,
      earliestDueDate: row.earliestDueDate?.toISOString() ?? null,
      reason: row.reason,
      rowStatus: row.status,
      requisitionId: row.id,
      createdByName: row.createdByName,
      createdAt: row.createdAt.toISOString(),
      reviewedByName: row.reviewedByName,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    });
  }

  const merged = [...allRecommendations, ...requisitionOnlyRows];
  const rows = filterRows(merged, filters);

  const eligible = merged.filter((row) => row.rowStatus !== "MONITOR");
  const critical = eligible.filter((row) => row.risk === "CRITICAL");
  const draftsCount = requisitions.filter((row) => row.status === "DRAFT").length;
  const pendingReview = eligible.filter((row) => row.rowStatus === "DRAFT" || row.rowStatus === "RECOMMENDATION").length;
  const orderIds = new Set(eligible.flatMap((row) => row.affectedOrders.map((order) => order.id)));

  let emptyReason: string | null = null;
  if (materialsSnapshot.emptyReason) {
    emptyReason = materialsSnapshot.emptyReason;
  } else if (eligible.length === 0) {
    emptyReason = "No procurement requirements identified. Current production demand and material availability are covered.";
  } else if (rows.length === 0) {
    emptyReason = "No rows match the current filters.";
  }

  return {
    brand: materialsSnapshot.brand,
    disclaimer: materialsSnapshot.disclaimer,
    generatedAt: materialsSnapshot.generatedAt,
    view: filters.view,
    kpis: [
      {
        id: "attention",
        label: "Procurement attention",
        value: formatCount(eligible.length),
        hint: "CRITICAL, HIGH, or MEDIUM",
      },
      {
        id: "critical",
        label: "Critical requirements",
        value: formatCount(critical.length),
        hint: "Immediate review",
      },
      {
        id: "suggested",
        label: "Suggested requisitions",
        value: formatCount(eligible.filter((row) => row.suggestedQuantity > 0).length),
        hint: "Net requirement > 0",
      },
      {
        id: "orders",
        label: "Production orders exposed",
        value: formatCount(orderIds.size),
        hint: "Affected by shortages",
      },
      {
        id: "pending",
        label: "Pending review",
        value: formatCount(pendingReview),
        hint: `${draftsCount} draft${draftsCount === 1 ? "" : "s"} saved`,
      },
    ],
    rows,
    pendingReviewCount: pendingReview,
    emptyReason,
    planningNote:
      "Requisition drafts are planning recommendations only. No purchase order or supplier communication is created.",
  };
}

export async function createRequisitionDraft(ctx: TenantContext, productId: string) {
  requirePermission(ctx, "procurement.create");
  requireUser(ctx);
  const prisma = getPrisma();

  const materialsSnapshot = await getMaterialsSnapshot(ctx, resolveMaterialsFilters({ view: "requirements" }));
  const material = materialsSnapshot.materials.find((row) => row.productId === productId);
  if (!material) throw new ServerError("Material not found in current requirements.", "NOT_FOUND");
  if (!isProcurementRecommendation(material)) {
    throw new ServerError("This material does not require a procurement requisition.", "FORBIDDEN");
  }

  const existing = await prisma.procurementRequisition.findFirst({
    where: { tenantId: ctx.tenantId, productId, status: "DRAFT" },
  });
  if (existing) return getRequisitionDetail(ctx, existing.id);

  const quantity = suggestedProcurementQuantity(material);
  const reason = procurementRecommendationReason(material);

  const created = await prisma.procurementRequisition.create({
    data: {
      tenantId: ctx.tenantId,
      productId,
      quantity,
      reason,
      risk: material.risk,
      status: "DRAFT",
      materialSku: material.sku,
      materialName: material.name,
      materialUnit: material.unit,
      grossRequirement: new Prisma.Decimal(material.grossRequirement),
      available: material.available,
      incoming: material.incoming,
      projectedAvailable: new Prisma.Decimal(material.projectedAvailable),
      netRequirement: material.netRequirement,
      earliestDueDate: material.earliestDueDate ? new Date(material.earliestDueDate) : null,
      affectedOrders: material.affectedOrders as unknown as Prisma.InputJsonValue,
      createdById: ctx.userId!,
    },
  });

  return getRequisitionDetail(ctx, created.id);
}

export async function reviewRequisition(ctx: TenantContext, id: string, decision: "review" | "reject") {
  if (!canProcurementApprove(ctx.role)) {
    throw new ServerError("You do not have permission to review requisitions.", "FORBIDDEN");
  }
  requireUser(ctx);
  const prisma = getPrisma();

  const existing = await prisma.procurementRequisition.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) throw new ServerError("Requisition not found.", "NOT_FOUND");
  if (existing.status !== "DRAFT") {
    throw new ServerError("Only draft requisitions can be reviewed or rejected.", "FORBIDDEN");
  }

  const now = new Date();
  const updated = await prisma.procurementRequisition.update({
    where: { id },
    data:
      decision === "review"
        ? { status: "REVIEWED", reviewedById: ctx.userId, reviewedAt: now }
        : { status: "REJECTED", reviewedById: ctx.userId, rejectedAt: now },
  });

  return getRequisitionDetail(ctx, updated.id);
}

export async function getRequisitionDetail(ctx: TenantContext, id: string): Promise<ProcurementRequisitionDetail> {
  const prisma = getPrisma();
  const row = await prisma.procurementRequisition.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      createdBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
    },
  });
  if (!row) throw new ServerError("Requisition not found.", "NOT_FOUND");
  const supplier = await getMaterialSupplierSnapshot(ctx, row.productId).catch(() => ({
    candidates: [],
    recommendation: {
      supplierId: null,
      title: "Supplier recommendation unavailable",
      reason: "Historical supplier data is insufficient.",
      confidence: "limited-data" as const,
    },
    comparisonNote: "Supplier comparison limited — historical performance unavailable.",
  }));

  return {
    id: row.id,
    status: row.status as ProcurementRequisitionStatus,
    materialSku: row.materialSku,
    materialName: row.materialName,
    materialUnit: row.materialUnit,
    quantity: row.quantity,
    risk: row.risk as MaterialRisk,
    reason: row.reason,
    grossRequirement: Number(row.grossRequirement),
    available: row.available,
    incoming: row.incoming,
    projectedAvailable: Number(row.projectedAvailable),
    netRequirement: row.netRequirement,
    earliestDueDate: row.earliestDueDate?.toISOString() ?? null,
    affectedOrders: row.affectedOrders as AffectedProductionOrder[],
    createdByName: row.createdBy.name,
    createdAt: row.createdAt.toISOString(),
    reviewedByName: row.reviewedBy?.name ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    supplierOptions: supplier.candidates,
    supplierRecommendation: supplier.recommendation,
    supplierComparisonNote: supplier.comparisonNote,
  };
}

export async function listPendingRequisitions(ctx: TenantContext) {
  const prisma = getPrisma();
  const rows = await prisma.procurementRequisition.findMany({
    where: { tenantId: ctx.tenantId, status: "DRAFT" },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map((row) => ({
    id: row.id,
    title: `${row.materialName} (${row.materialSku})`,
    detail: `${row.quantity.toLocaleString("en-KE")} ${row.materialUnit} · ${row.risk} risk`,
    reason: row.reason,
    createdByName: row.createdBy.name,
    createdAt: row.createdAt.toISOString(),
    status: row.status as ProcurementRequisitionStatus,
  }));
}

export async function getProcurementAttentionCount(ctx: TenantContext): Promise<number> {
  const snapshot = await getProcurementSnapshot(ctx, resolveProcurementFilters({ view: "needs-review" }));
  return snapshot.pendingReviewCount;
}
