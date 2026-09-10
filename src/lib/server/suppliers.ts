import { Prisma } from "@prisma/client";

import { compareSupplierCandidates, recommendSupplier } from "@/lib/suppliers/scoring";
import type {
  MaterialSupplierSnapshot,
  SupplierCandidate,
  SupplierDetail,
  SupplierSnapshot,
  SupplierStatusId,
  SupplierViewId,
} from "@/lib/suppliers/types";
import { SUPPLIER_VIEWS } from "@/lib/suppliers/types";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";
import { formatCount } from "@/lib/server/money";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";

export type SupplierFilters = { view: SupplierViewId; status?: SupplierStatusId; query?: string; materialId?: string };

function parseView(value?: string): SupplierViewId {
  return SUPPLIER_VIEWS.includes(value as SupplierViewId) ? (value as SupplierViewId) : "all";
}

function parseStatus(value?: string): SupplierStatusId | undefined {
  if (value === "ACTIVE" || value === "INACTIVE") return value;
  return undefined;
}

export function resolveSupplierFilters(input: { view?: string; status?: string; q?: string; material?: string }): SupplierFilters {
  return {
    view: parseView(input.view),
    status: parseStatus(input.status),
    query: input.q?.trim() || undefined,
    materialId: input.material?.trim() || undefined,
  };
}

export async function getSupplierSnapshot(ctx: TenantContext, filters: SupplierFilters): Promise<SupplierSnapshot> {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, status: true } });
  if (!tenant) throw new ServerError("Tenant not found.", "NOT_FOUND");

  const where: Prisma.SupplierWhereInput = { tenantId: ctx.tenantId };
  if (filters.status) where.status = filters.status;
  if (filters.view === "active") where.status = "ACTIVE";
  if (filters.view === "inactive") where.status = "INACTIVE";
  if (filters.query) {
    where.OR = [{ name: { contains: filters.query, mode: "insensitive" } }, { code: { contains: filters.query, mode: "insensitive" } }];
  }

  const suppliers = await prisma.supplier.findMany({
    where,
    include: { supplierMaterials: true },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  const rows = suppliers
    .map((row) => {
      const materialRows = filters.materialId
        ? row.supplierMaterials.filter((item) => item.productId === filters.materialId)
        : row.supplierMaterials;
      const materialsCovered = materialRows.length;
      const preferredMaterials = materialRows.filter((item) => item.isPreferred).length;
      const leadTimeCoverage = materialRows.filter((item) => item.leadTimeDays !== null).length;
      const priceCoverage = materialRows.filter((item) => item.unitPrice !== null).length;
      return {
        supplierId: row.id,
        name: row.name,
        code: row.code,
        status: row.status as SupplierStatusId,
        materialsCovered,
        preferredMaterials,
        leadTimeCoverage,
        priceCoverage,
        performanceCoverage: 0,
        updatedAt: row.updatedAt.toISOString(),
      };
    })
    .filter((row) => (filters.view === "gaps" ? row.materialsCovered === 0 : true));

  const allRelations = suppliers.flatMap((row) => row.supplierMaterials);
  const materialsCovered = new Set(allRelations.map((row) => row.productId));
  const atRiskMaterials = await getMaterialsSnapshot(ctx, resolveMaterialsFilters({ view: "requirements" }));
  const materialUniverse = new Set(atRiskMaterials.materials.map((row) => row.productId));
  const uncoveredMaterials = [...materialUniverse].filter((id) => !materialsCovered.has(id)).length;

  const emptyReason =
    rows.length === 0
      ? "No supplier intelligence records found. Add supplier-material relationships to enable sourcing comparison."
      : null;

  return {
    brand: tenant.name,
    disclaimer: tenant.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: new Date().toISOString(),
    view: filters.view,
    rows,
    statuses: [
      { id: "ACTIVE", label: "Active" },
      { id: "INACTIVE", label: "Inactive" },
    ],
    kpis: [
      { id: "active", label: "Active Suppliers", value: formatCount(rows.filter((row) => row.status === "ACTIVE").length), hint: "Tenant-scoped" },
      { id: "materials", label: "Materials Covered", value: formatCount(materialsCovered.size), hint: "With supplier linkage" },
      { id: "preferred", label: "Preferred Suppliers", value: formatCount(rows.filter((row) => row.preferredMaterials > 0).length), hint: "At least one preferred material" },
      { id: "relationships", label: "Supplier Relationships", value: formatCount(allRelations.length), hint: "Supplier-material rows" },
      { id: "coverage", label: "Data Coverage", value: `${materialUniverse.size > 0 ? Math.round((materialsCovered.size / materialUniverse.size) * 100) : 0}%`, hint: `${uncoveredMaterials} materials without supplier intelligence` },
    ],
    dataCoverageNote: "Historical delivery and quality performance are shown only when real data exists.",
    emptyReason,
  };
}

export async function getSupplierDetail(ctx: TenantContext, supplierId: string): Promise<SupplierDetail> {
  const prisma = getPrisma();
  const row = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId: ctx.tenantId },
    include: { supplierMaterials: { include: { product: true }, orderBy: { updatedAt: "desc" } } },
  });
  if (!row) throw new ServerError("Supplier not found.", "NOT_FOUND");

  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status as SupplierStatusId,
    materials: row.supplierMaterials.map((item) => ({
      productId: item.productId,
      sku: item.product.sku,
      name: item.product.name,
      preferred: item.isPreferred,
      leadTimeDays: item.leadTimeDays,
      minimumOrderQuantity: item.minimumOrderQuantity,
      unitPrice: item.unitPrice ? Number(item.unitPrice) : null,
      currency: item.currency,
      updatedAt: item.updatedAt.toISOString(),
    })),
    knownPrices: row.supplierMaterials.filter((item) => item.unitPrice !== null).length,
    leadTimeKnown: row.supplierMaterials.filter((item) => item.leadTimeDays !== null).length,
    performanceAvailable: false,
  };
}

export async function getMaterialSupplierSnapshot(ctx: TenantContext, productId: string): Promise<MaterialSupplierSnapshot> {
  const prisma = getPrisma();
  const material = await prisma.product.findFirst({ where: { id: productId, tenantId: ctx.tenantId }, select: { id: true, sku: true, name: true } });
  if (!material) throw new ServerError("Material not found.", "NOT_FOUND");

  const requirements = await getMaterialsSnapshot(ctx, resolveMaterialsFilters({ material: productId }));
  const mat = requirements.materials.find((row) => row.productId === productId);

  const links = await prisma.supplierMaterial.findMany({
    where: { tenantId: ctx.tenantId, productId },
    include: { supplier: true },
    orderBy: [{ isPreferred: "desc" }, { updatedAt: "desc" }],
  });

  const candidates: SupplierCandidate[] = links.map((row) => ({
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    supplierCode: row.supplier.code,
    status: row.supplier.status as SupplierStatusId,
    preferred: row.isPreferred,
    leadTimeDays: row.leadTimeDays,
    minimumOrderQuantity: row.minimumOrderQuantity,
    unitPrice: row.unitPrice ? Number(row.unitPrice) : null,
    currency: row.currency ?? null,
    priceUpdatedAt: row.unitPrice ? row.updatedAt.toISOString() : null,
    deliveryPerformance: null,
    qualityPerformance: null,
    lastKnownPrice: row.unitPrice ? `${row.currency ?? "—"} ${Number(row.unitPrice).toLocaleString("en-KE", { maximumFractionDigits: 2 })}` : "Not available",
    updatedAt: row.updatedAt.toISOString(),
  }));

  const ranked = compareSupplierCandidates(candidates);
  return {
    productId: material.id,
    materialSku: material.sku,
    materialName: material.name,
    materialRisk: mat?.risk ?? "OK",
    candidates: ranked,
    recommendation: recommendSupplier(ranked),
    comparisonNote:
      ranked.length === 0
        ? "Supplier comparison limited — historical performance unavailable."
        : "Supplier comparison limited — historical delivery and quality performance unavailable.",
  };
}

export async function getSupplierDataGapCount(ctx: TenantContext): Promise<number> {
  const prisma = getPrisma();
  const materials = await getMaterialsSnapshot(ctx, resolveMaterialsFilters({ view: "requirements" }));
  const materialIds = [...new Set(materials.materials.map((row) => row.productId))];
  if (materialIds.length === 0) return 0;
  const linked = await prisma.supplierMaterial.findMany({
    where: { tenantId: ctx.tenantId, productId: { in: materialIds } },
    select: { productId: true },
  });
  const linkedIds = new Set(linked.map((row) => row.productId));
  return materialIds.filter((id) => !linkedIds.has(id)).length;
}
