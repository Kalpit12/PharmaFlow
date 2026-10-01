import type { BatchQualityStatus } from "@/lib/batches/types";

export const TRACEABILITY_ENTITY_TYPES = ["lot", "batch", "order", "customer"] as const;
export type TraceabilityEntityType = (typeof TRACEABILITY_ENTITY_TYPES)[number];

export const TRACEABILITY_COVERAGE = ["TRACEABLE", "PARTIAL", "NOT_RECORDED"] as const;
export type TraceabilityCoverage = (typeof TRACEABILITY_COVERAGE)[number];

export const TRACEABILITY_CONFIDENCE = ["COMPLETE", "PARTIAL", "INSUFFICIENT_DATA"] as const;
export type TraceabilityConfidence = (typeof TRACEABILITY_CONFIDENCE)[number];

export const IMPACT_SCOPE = ["NO_KNOWN_IMPACT", "LIMITED_IMPACT", "SIGNIFICANT_IMPACT", "UNKNOWN"] as const;
export type ImpactScope = (typeof IMPACT_SCOPE)[number];

export type TraceabilityLink = {
  id: string;
  label: string;
  from: string;
  to: string;
  coverage: TraceabilityCoverage;
  note?: string;
};

export type TraceabilityPathNode = {
  id: string;
  kind: "supplier" | "material_lot" | "production_batch" | "finished_product" | "sales_order" | "customer";
  label: string;
  sublabel?: string;
  coverage: TraceabilityCoverage;
  href?: string;
  entityId?: string;
};

export type TraceabilityEntityOption = {
  id: string;
  type: TraceabilityEntityType;
  label: string;
  sublabel: string;
};

export type TraceabilityImpactRow = {
  id: string;
  kind: string;
  label: string;
  detail: string;
  coverage: TraceabilityCoverage;
  href?: string;
};

export type TraceabilityImpactSummary = {
  title: string;
  scope: ImpactScope;
  confidence: TraceabilityConfidence;
  affectedMaterialLots: number;
  affectedProductionBatches: number;
  affectedFinishedBatches: number;
  affectedSalesOrders: number;
  affectedCustomers: number;
  affectedQuantityLabel: string;
  allocationNote: string;
  rows: TraceabilityImpactRow[];
};

export type TraceabilityCoverageRow = {
  id: string;
  link: string;
  coverage: TraceabilityCoverage;
  note: string;
};

export type TraceabilityAttentionItem = {
  id: string;
  severity: "CRITICAL" | "HIGH" | "WARNING";
  title: string;
  detail: string;
  href: string;
};

export type TraceabilityInvestigation = {
  entityType: TraceabilityEntityType;
  entityId: string;
  entityLabel: string;
  direction: "forward" | "reverse";
  path: TraceabilityPathNode[];
  coverage: TraceabilityCoverageRow[];
  impact: TraceabilityImpactSummary;
  exceptions: string[];
};

export type TraceabilityKpi = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

export type TraceabilitySnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  query?: string;
  entityType?: TraceabilityEntityType;
  entityId?: string;
  kpis: TraceabilityKpi[];
  options: TraceabilityEntityOption[];
  investigation: TraceabilityInvestigation | null;
  attention: TraceabilityAttentionItem[];
  emptyReason: string | null;
};

export type TraceabilityBatchSummary = {
  id: string;
  batchNumber: string;
  productId: string;
  productName: string;
  productSku: string;
  qualityStatus: BatchQualityStatus;
  plannedQuantity: number;
  producedLabel: string;
  productionOrderId: string;
  orderNumber: string;
};

export type TraceabilityLotSummary = {
  id: string;
  batchCode: string;
  productId: string;
  productName: string;
  productSku: string;
  supplierName: string | null;
  quantity: number;
  receivedAt: string | null;
};

export type TraceabilityOrderSummary = {
  id: string;
  reference: string;
  customerId: string;
  customerName: string;
  orderedAt: string;
  productIds: string[];
};

export type TraceabilityCustomerSummary = {
  id: string;
  name: string;
  orderCount: number;
};
