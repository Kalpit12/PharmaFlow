import type { IntelligenceSnapshot } from "@/lib/intelligence/types";
import type { MaterialStatus, ReportRisk } from "@/lib/reports/risk";

export const REPORT_VIEWS = [
  "executive",
  "sales",
  "operations",
  "inventory",
  "procurement",
  "suppliers",
  "overview",
  "health",
  "expiry",
  "ageing",
  "production",
  "materials",
  "finished-goods",
  "raw-materials",
  "packaging",
] as const;

export const REPORT_PRIMARY_VIEWS = ["executive", "sales", "operations", "inventory", "procurement", "suppliers"] as const;

export type ReportViewId = (typeof REPORT_VIEWS)[number];
export type InventoryClassId = "FINISHED_GOOD" | "RAW_MATERIAL" | "PACKAGING";

export type ReportKpi = {
  id: string;
  label: string;
  value: string;
  hint: string;
  risk: ReportRisk;
  href: string;
  available: boolean;
};

export type ReportLot = {
  id: string;
  batchCode: string;
  productName: string;
  sku: string;
  category: string;
  warehouseId: string;
  warehouseName: string;
  supplierId: string | null;
  supplierName: string | null;
  classId: InventoryClassId;
  quantity: number;
  value: string;
  valueAmount: number;
  receivedAt: string;
  expiryDate: string | null;
  daysRemaining: number | null;
  ageDays: number;
  expiryBucket: string | null;
  ageingBucket: string;
  expiryRisk: ReportRisk | null;
  ageingRisk: ReportRisk;
  safetyStock: number;
  materialStatus: MaterialStatus;
};

export type BucketRow = {
  id: string;
  label: string;
  quantity: number;
  share: number;
  items: number;
  risk: ReportRisk;
};

export type RankedItem = {
  id: string;
  title: string;
  detail: string;
  quantity: number;
  risk: ReportRisk;
  meta: string;
};

export type MaterialRow = {
  id: string;
  title: string;
  classId: InventoryClassId;
  stock: number;
  incoming: number;
  requirement: number;
  available: number;
  coverage: number;
  safety: number;
  status: MaterialStatus;
  risk: ReportRisk;
  suppliers: string[];
  hasBom: boolean;
  projected: number;
  netRequirement: number;
  affectedOrders: number;
  earliestDue: string | null;
  mrpRisk: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OK" | null;
};

export type HistoryPoint = {
  date: string;
  label: string;
  quantity: number;
  value: number;
};

export type ProductionOrderRow = {
  id: string;
  orderNumber: string;
  productName: string;
  workstationId: string | null;
  workstationName: string | null;
  displayStatus: string;
  quantity: number;
  priority: string;
  dueDate: string;
  plannedStart: string | null;
  plannedEnd: string | null;
};

/** Open inbound receipts surfaced on inventory / procurement reports. */
export type InboundReceiptRow = {
  id: string;
  reference: string;
  productName: string;
  sku: string;
  quantity: number;
  supplierName: string | null;
  expectedAt: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
};

export type ReportingSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  view: ReportViewId;
  kpis: ReportKpi[];
  findings: string[];
  historyNote: string;
  history: HistoryPoint[];
  lots: ReportLot[];
  expiryBuckets: BucketRow[];
  ageingBuckets: BucketRow[];
  composition: Array<{ id: string; label: string; quantity: number; share: number }>;
  concentration: { sku: string; title: string; quantity: number; share: number } | null;
  highValue: RankedItem[];
  warehouses: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  categories: string[];
  topExpiry: RankedItem[];
  materials: MaterialRow[];
  materialPlan: {
    required: number;
    shortageQty: number;
    atRisk: number;
    ordersAffected: number;
    incomingCoverage: number;
    concentration: { sku: string; title: string; netRequirement: number; share: number } | null;
    procurementAttention: number;
    criticalRequisitions: number;
    pendingReview: number;
    requestedQuantity: number;
    supplierCoverage: number;
    preferredCoverage: number;
    leadTimeVisibility: number;
    pricingVisibility: number;
    rfqTotal: number;
    rfqsAwaitingResponse: number;
    rfqsInEvaluation: number;
    rfqsAwarded: number;
    rfqResponseCoverage: number;
    rfqAverageLeadTimeDays: number | null;
    rfqQuotedValue: number | null;
    rfqQuotedCurrency: string | null;
    poDraft: number;
    poPendingApproval: number;
    poApproved: number;
    poApprovedValue: number | null;
    poApprovedCurrency: string | null;
    receivingAwaiting: number;
    receivingPartial: number;
    receivingComplete: number;
    receivingOutstandingQty: number;
    receivingReceivedQty: number;
    receivingDiscrepancies: number;
    supplierPerfWithHistory: number;
    supplierPerfCompletionRate: number | null;
    supplierPerfDiscrepancyRate: number | null;
    supplierPerfConcentration: number | null;
    supplierPerfOpenExposure: number;
    supplierPerfAttention: number;
  };
  health: Array<{ id: string; label: string; count: number; quantity: number }>;
  production: {
    scheduled: number;
    unscheduled: number;
    atRisk: number;
    late: number;
    critical: number;
    completed: number;
    inProgress: number;
    utilization: string;
    statuses: Array<{ id: string; label: string; count: number }>;
    lines: Array<{ id: string; name: string; utilization: number; orders: number }>;
    dueRisk: RankedItem[];
    orders: ProductionOrderRow[];
  workstations: Array<{ id: string; name: string }>;
  plannedVsActual: Array<{ id: string; label: string; primary: number; secondary: number | null; href?: string }>;
};
  sales: SalesReportSlice;
  executiveKpis: ReportKpi[];
  managementAttention: ManagementAttentionItem[];
  forecastOutlook: ForecastOutlookSlice;
  scenarioHref: string;
  scenarioPlanning?: {
    baselineLabel: string;
    scenarioLabel: string;
    rows: Array<{ id: string; label: string; current: string; scenario: string; variance: string }>;
    href: string;
  };
  supplierBands: Array<{ id: string; label: string; count: number }>;
  supplierAttention: Array<{ id: string; name: string; band: string; reason: string }>;
  procurementPipeline: Array<{ id: string; label: string; count: number; href: string }>;
  inboundReceipts: InboundReceiptRow[];
  metricNotes: Array<{ id: string; label: string; how: string }>;
  intelligence: IntelligenceSnapshot;
};

export type ManagementAttentionItem = {
  id: string;
  domain: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  issue: string;
  evidence: string;
  impact: string;
  href: string;
};

export type SalesReportSlice = {
  revenue: string;
  revenueGrowth: string;
  orders: number;
  ordersGrowth: string;
  rfqs: number;
  priorRevenueZero: boolean;
  definition: string;
  series: Array<{ label: string; revenue: number; orders: number; rfqs: number }>;
  regions: Array<{ id: string; country: string; revenue: string; orders: number; href: string }>;
  products: Array<{ id: string; name: string; revenue: string; units: number; href: string }>;
  customers: Array<{ id: string; name: string; revenue: string; share: string; href: string }>;
  empty: boolean;
};

export type ForecastOutlookSlice = {
  horizon: string;
  sales: string;
  production: string;
  materials: string;
  procurement: string;
  confidence: string;
  href: string;
};

export type CompactReportContext = {
  view: string;
  revenue: string;
  revenueGrowth: string;
  productionAtRisk: number;
  expiredQty: string;
  materialShortages: number;
  procurementOpen: string;
  supplierAttention: number;
  signals: Array<{ domain: string; issue: string; severity: string }>;
  limitedData: string[];
};
