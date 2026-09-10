export const SUPPLIER_PERFORMANCE_VIEWS = ["all", "history", "attention", "excellent", "risk", "insufficient"] as const;
export type SupplierPerformanceViewId = (typeof SUPPLIER_PERFORMANCE_VIEWS)[number];

export const PERFORMANCE_BANDS = ["EXCELLENT", "STRONG", "WATCH", "RISK", "INSUFFICIENT_DATA"] as const;
export type PerformanceBand = (typeof PERFORMANCE_BANDS)[number];

export type SupplierPerformanceKpi = { id: string; label: string; value: string };

export type SupplierPerformanceRow = {
  supplierId: string;
  name: string;
  code: string;
  status: "ACTIVE" | "INACTIVE";
  rfqsInvited: number;
  rfqsResponded: number;
  rfqsAwarded: number;
  responseRateLabel: string;
  poCount: number;
  orderedValueLabel: string;
  receivedValueLabel: string;
  orderedQuantity: number;
  receivedQuantity: number;
  completionRateLabel: string;
  discrepancyRateLabel: string;
  averageReceivingDelayLabel: string;
  knownLeadTimeLabel: string;
  knownPricingLabel: string;
  preferred: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  band: PerformanceBand;
  scoreLabel: string;
  insufficientReasons: string[];
  attentionFlags: string[];
  hasHistory: boolean;
};

export type SupplierPerformanceAttention = {
  id: string;
  supplierId: string;
  supplierName: string;
  title: string;
  evidence: string;
  href: string;
};

export type SupplierPerformanceHistoryLink = {
  id: string;
  label: string;
  href: string;
  meta: string;
};

export type SupplierPerformanceDetail = {
  supplierId: string;
  name: string;
  code: string;
  status: "ACTIVE" | "INACTIVE";
  band: PerformanceBand;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  scoreLabel: string;
  insufficientReasons: string[];
  attentionFlags: string[];
  metrics: {
    rfqsInvited: number;
    rfqsResponded: number;
    rfqsAwarded: number;
    responseRateLabel: string;
    poCount: number;
    orderedValueLabel: string;
    receivedValueLabel: string;
    orderedQuantity: number;
    receivedQuantity: number;
    completionRateLabel: string;
    discrepancyCount: number;
    discrepancyRateLabel: string;
    outstandingQuantity: number;
    averageReceivingDelayLabel: string;
    preferred: boolean;
    knownLeadTimeLabel: string;
    knownPricingLabel: string;
    priceVisibilityLabel: string;
  };
  materials: Array<{
    productId: string;
    sku: string;
    name: string;
    preferred: boolean;
    leadTimeDays: number | null;
    unitPriceLabel: string;
  }>;
  rfqHistory: SupplierPerformanceHistoryLink[];
  poHistory: SupplierPerformanceHistoryLink[];
  receivingHistory: SupplierPerformanceHistoryLink[];
  discrepancies: Array<{ id: string; label: string; reason: string; href: string }>;
};

export type SupplierPerformanceCompareRow = {
  supplierId: string;
  name: string;
  responseRateLabel: string;
  awards: number;
  poCount: number;
  orderedValueLabel: string;
  completionRateLabel: string;
  discrepancyRateLabel: string;
  leadTimeLabel: string;
  pricingVisibilityLabel: string;
  preferred: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  band: PerformanceBand;
};

export type SupplierPerformanceSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  view: SupplierPerformanceViewId;
  materialId: string | null;
  materialLabel: string | null;
  planningNote: string;
  kpis: SupplierPerformanceKpi[];
  rows: SupplierPerformanceRow[];
  attention: SupplierPerformanceAttention[];
  compare: SupplierPerformanceCompareRow[];
  emptyReason: string | null;
};

export type CompactSupplierPerformanceContext = {
  supplierCount: number;
  suppliersWithHistory: number;
  topPerformers: Array<{ name: string; band: string; completionRate: string }>;
  attentionSuppliers: Array<{ name: string; reason: string }>;
  completionRate: string;
  discrepancyRate: string;
  openExposure: string;
  confidence: string;
  materialFilter: string | null;
};
