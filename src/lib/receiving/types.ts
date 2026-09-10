export const RECEIVING_VIEWS = ["all", "awaiting", "partial", "complete", "discrepancy"] as const;
export type ReceivingViewId = (typeof RECEIVING_VIEWS)[number];

export type ReceivingFilters = {
  view: ReceivingViewId;
  query?: string;
};

export type ReceivingKpi = { id: string; label: string; value: string };

export type ReceivingListRow = {
  id: string;
  poNumber: string;
  supplierName: string;
  status: string;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  hasDiscrepancy: boolean;
  createdAt: string;
  href: string;
};

export type ReceivingListSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  view: ReceivingViewId;
  kpis: ReceivingKpi[];
  rows: ReceivingListRow[];
  emptyReason: string | null;
  planningNote: string;
};

export type ReceivingLineInput = {
  purchaseOrderItemId: string;
  quantityReceived: number;
  batchCode: string;
  expiryDate?: string | null;
  warehouseId: string;
  notes?: string | null;
};

export type ReceivingLineView = {
  id: string;
  productId: string;
  description: string;
  sku: string;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  unitPrice: string;
  currency: string;
  warehouses: Array<{ id: string; name: string; code: string }>;
};

export type ReceivingReceiptHistory = {
  id: string;
  reference: string;
  quantity: number;
  batchCode: string | null;
  receivedAt: string;
  discrepancyReason: string | null;
  receivedByName: string | null;
};

export type ReceivingDetail = {
  id: string;
  poNumber: string;
  status: string;
  supplierName: string;
  supplierCode: string;
  currency: string;
  canReceive: boolean;
  fullyReceived: boolean;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  items: ReceivingLineView[];
  receipts: ReceivingReceiptHistory[];
  rfqHref: string | null;
  rfqReference: string | null;
};

export type ReceivePurchaseOrderResult = {
  purchaseOrderId: string;
  poNumber: string;
  status: string;
  receivedNow: number;
  discrepancies: string[];
  fullyReceived: boolean;
};
