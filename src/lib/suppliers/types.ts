import type { MaterialRisk } from "@/lib/materials/types";

export const SUPPLIER_VIEWS = ["all", "active", "inactive", "gaps"] as const;
export type SupplierViewId = (typeof SUPPLIER_VIEWS)[number];

export type SupplierStatusId = "ACTIVE" | "INACTIVE";

export type SupplierCandidate = {
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  status: SupplierStatusId;
  preferred: boolean;
  leadTimeDays: number | null;
  minimumOrderQuantity: number | null;
  unitPrice: number | null;
  currency: string | null;
  priceUpdatedAt: string | null;
  deliveryPerformance: string | null;
  qualityPerformance: string | null;
  lastKnownPrice: string;
  updatedAt: string;
};

export type SupplierRecommendation = {
  supplierId: string | null;
  title: string;
  reason: string;
  confidence: "verified-data" | "limited-data";
};

export type SupplierRow = {
  supplierId: string;
  name: string;
  code: string;
  status: SupplierStatusId;
  materialsCovered: number;
  preferredMaterials: number;
  leadTimeCoverage: number;
  priceCoverage: number;
  performanceCoverage: number;
  updatedAt: string;
};

export type SupplierSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  view: SupplierViewId;
  rows: SupplierRow[];
  statuses: Array<{ id: SupplierStatusId; label: string }>;
  kpis: Array<{ id: string; label: string; value: string; hint: string }>;
  dataCoverageNote: string;
  emptyReason: string | null;
};

export type SupplierDetail = {
  id: string;
  name: string;
  code: string;
  status: SupplierStatusId;
  materials: Array<{
    productId: string;
    sku: string;
    name: string;
    preferred: boolean;
    leadTimeDays: number | null;
    minimumOrderQuantity: number | null;
    unitPrice: number | null;
    currency: string | null;
    updatedAt: string;
  }>;
  knownPrices: number;
  leadTimeKnown: number;
  performanceAvailable: boolean;
};

export type MaterialSupplierSnapshot = {
  productId: string;
  materialSku: string;
  materialName: string;
  materialRisk: MaterialRisk;
  candidates: SupplierCandidate[];
  recommendation: SupplierRecommendation;
  comparisonNote: string;
};
