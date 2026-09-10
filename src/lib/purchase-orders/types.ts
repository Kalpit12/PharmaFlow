export const PURCHASE_ORDER_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "CLOSED",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const PURCHASE_ORDER_VIEWS = [
  "all",
  "draft",
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type PurchaseOrderViewId = (typeof PURCHASE_ORDER_VIEWS)[number];

export type PurchaseOrderKpi = { id: string; label: string; value: string };

export type PurchaseOrderListRow = {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  supplierName: string;
  rfqReference: string | null;
  totalLabel: string;
  currency: string;
  createdAt: string;
  createdByName: string;
};

export type PurchaseOrderItemView = {
  id: string;
  productId: string;
  description: string;
  sku: string;
  quantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  unitPrice: string;
  currency: string;
  lineTotal: string;
};

export type PurchaseOrderDetail = {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  procurementRfqId: string | null;
  rfqReference: string | null;
  rfqHref: string | null;
  procurementRequisitionId: string | null;
  requisitionHref: string | null;
  currency: string;
  subtotal: string;
  notes: string | null;
  createdAt: string;
  createdByName: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  items: PurchaseOrderItemView[];
  canEdit: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReceive: boolean;
  receivingHref: string | null;
  receivedQuantity: number;
  remainingQuantity: number;
};

export type PurchaseOrderListSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  view: PurchaseOrderViewId;
  kpis: PurchaseOrderKpi[];
  rows: PurchaseOrderListRow[];
  emptyReason: string | null;
  planningNote: string;
};

export type PurchaseOrderApprovalItem = {
  id: string;
  poNumber: string;
  supplierName: string;
  totalLabel: string;
  status: PurchaseOrderStatus;
  createdByName: string;
  createdAt: string;
};

export type CompactPurchaseOrderContext = {
  poNumber: string;
  status: string;
  supplier: string;
  currency: string;
  subtotal: string;
  items: Array<{ description: string; quantity: number; unitPrice: string; lineTotal: string }>;
  rfqReference: string | null;
  notes: string | null;
};
