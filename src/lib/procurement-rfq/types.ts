export const PROCUREMENT_RFQ_STATUSES = [
  "DRAFT",
  "REVIEW",
  "READY",
  "RESPONSES",
  "EVALUATION",
  "AWARDED",
  "CLOSED",
  "CANCELLED",
] as const;
export type ProcurementRfqStatus = (typeof PROCUREMENT_RFQ_STATUSES)[number];

export const PROCUREMENT_RFQ_VIEWS = [
  "all",
  "draft",
  "review",
  "ready",
  "responses",
  "evaluation",
  "awarded",
  "closed",
] as const;
export type ProcurementRfqViewId = (typeof PROCUREMENT_RFQ_VIEWS)[number];

export type ProcurementRfqKpi = { id: string; label: string; value: string };

export type ProcurementRfqListRow = {
  id: string;
  reference: string;
  title: string;
  status: ProcurementRfqStatus;
  itemsLabel: string;
  supplierCount: number;
  quantityLabel: string;
  responseStatus: string;
  dueDate: string | null;
  createdAt: string;
};

export type ProcurementRfqSupplierOption = {
  supplierId: string;
  name: string;
  code: string;
  status: string;
  preferred: boolean;
  leadTimeDays: number | null;
  unitPrice: string | null;
  currency: string | null;
  recommendationReason: string;
};

export type ProcurementRfqResponseItemView = {
  id: string;
  rfqItemId: string;
  productName: string;
  sku: string;
  requestedQuantity: number;
  quotedQuantity: number;
  unitPrice: string | null;
  lineTotal: string | null;
  notes: string | null;
};

export type ProcurementRfqResponseView = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierStatus: string;
  responseStatus: string;
  quotedAt: string | null;
  currency: string | null;
  totalAmount: string | null;
  leadTimeDays: number | null;
  notes: string | null;
  completeness: string;
  items: ProcurementRfqResponseItemView[];
};

export type ProcurementRfqComparisonRow = {
  id: string;
  supplierName: string;
  responseId: string;
  quotedQuantity: string;
  unitPrice: string;
  total: string;
  currency: string;
  leadTime: string;
  responseStatus: string;
  completeness: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OK";
  reasoning: string;
  comparable: boolean;
};

export type ProcurementRfqDetail = {
  id: string;
  reference: string;
  title: string;
  status: ProcurementRfqStatus;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string;
  procurementSourceHref: string | null;
  procurementSourceLabel: string | null;
  items: Array<{
    id: string;
    productId: string;
    name: string;
    sku: string;
    quantity: number;
    unit: string;
    notes: string | null;
  }>;
  invitedSuppliers: Array<{
    id: string;
    supplierId: string;
    name: string;
    code: string;
    status: string;
    invitationStatus: string;
    preferred: boolean;
    leadTimeDays: number | null;
    unitPrice: string | null;
  }>;
  suppliers: ProcurementRfqSupplierOption[];
  responses: ProcurementRfqResponseView[];
  comparison: ProcurementRfqComparisonRow[];
  currencyComparable: boolean;
  evaluationSummary: string;
  awardedResponseId: string | null;
  canAward: boolean;
  canReview: boolean;
  linkedPurchaseOrder: { id: string; poNumber: string; status: string } | null;
};

export type ProcurementRfqListSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  view: ProcurementRfqViewId;
  kpis: ProcurementRfqKpi[];
  rows: ProcurementRfqListRow[];
  emptyReason: string | null;
  planningNote: string;
};

export type CompactProcurementRfqContext = {
  reference: string;
  title: string;
  status: string;
  items: Array<{ name: string; quantity: number; unit: string }>;
  suppliers: Array<{ name: string; preferred: boolean; leadTime: string; price: string }>;
  comparison: Array<{ supplier: string; total: string; leadTime: string; completeness: string; reasoning: string }>;
  evaluationSummary: string;
};
