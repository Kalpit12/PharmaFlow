import type { AffectedProductionOrder, MaterialRequirement, MaterialRisk } from "@/lib/materials/types";
import type { SupplierCandidate, SupplierRecommendation } from "@/lib/suppliers/types";

export const PROCUREMENT_VIEWS = ["all", "critical", "needs-review", "reviewed", "rejected"] as const;
export type ProcurementViewId = (typeof PROCUREMENT_VIEWS)[number];

export const PROCUREMENT_REQUISITION_STATUSES = ["DRAFT", "REVIEWED", "REJECTED"] as const;
export type ProcurementRequisitionStatus = (typeof PROCUREMENT_REQUISITION_STATUSES)[number];

export type ProcurementRowStatus = "RECOMMENDATION" | "MONITOR" | ProcurementRequisitionStatus;

export type ProcurementRecommendation = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  risk: MaterialRisk;
  grossRequirement: number;
  available: number;
  incoming: number;
  projectedAvailable: number;
  netRequirement: number;
  shortage: boolean;
  suggestedQuantity: number;
  affectedOrders: AffectedProductionOrder[];
  earliestDueDate: string | null;
  reason: string;
  rowStatus: ProcurementRowStatus;
  requisitionId: string | null;
  createdByName: string | null;
  createdAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
};

export type ProcurementKpi = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

export type ProcurementSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  view: ProcurementViewId;
  kpis: ProcurementKpi[];
  rows: ProcurementRecommendation[];
  pendingReviewCount: number;
  emptyReason: string | null;
  planningNote: string;
};

export type ProcurementRequisitionDetail = {
  id: string;
  status: ProcurementRequisitionStatus;
  materialSku: string;
  materialName: string;
  materialUnit: string;
  quantity: number;
  risk: MaterialRisk;
  reason: string;
  grossRequirement: number;
  available: number;
  incoming: number;
  projectedAvailable: number;
  netRequirement: number;
  earliestDueDate: string | null;
  affectedOrders: AffectedProductionOrder[];
  createdByName: string;
  createdAt: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  rejectedAt: string | null;
  supplierOptions: SupplierCandidate[];
  supplierRecommendation: SupplierRecommendation;
  supplierComparisonNote: string;
};
