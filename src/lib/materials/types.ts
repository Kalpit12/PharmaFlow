export const MATERIAL_RISKS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "OK"] as const;
export type MaterialRisk = (typeof MATERIAL_RISKS)[number];

export const MATERIAL_VIEWS = ["requirements", "shortages", "procurement"] as const;
export type MaterialViewId = (typeof MATERIAL_VIEWS)[number];

/** Production order statuses included in material demand. COMPLETED is excluded. */
export const OPEN_PRODUCTION_STATUSES = ["UNSCHEDULED", "SCHEDULED", "IN_PROGRESS", "AT_RISK"] as const;
export type OpenProductionStatus = (typeof OPEN_PRODUCTION_STATUSES)[number];

export const PRODUCTION_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export type ProductionPriorityId = (typeof PRODUCTION_PRIORITIES)[number];

/** Confirmed shortage + high/critical priority + due within this many days → CRITICAL. */
export const IMMINENT_DUE_DAYS = 7;
/** Projected available below this share of gross, with no shortage → LOW (tight). */
export const TIGHT_COVERAGE_RATIO = 0.1;

export type MaterialBomLine = {
  productId: string;
  componentId: string;
  quantityPer: number;
};

export type MaterialOrderInput = {
  id: string;
  orderNumber: string;
  productId: string;
  productName: string;
  quantity: number;
  dueDate: string;
  priority: ProductionPriorityId;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
};

export type MaterialIdentity = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  safetyStock: number;
};

export type MaterialLotInput = {
  productId: string;
  batchCode: string;
  quantity: number;
  expiryDate: string | null;
  warehouseName: string;
};

export type MaterialReceiptInput = {
  productId: string;
  quantity: number;
};

export type AffectedProductionOrder = {
  id: string;
  orderNumber: string;
  productId: string;
  productName: string;
  quantity: number;
  requiredQuantity: number;
  dueDate: string;
  priority: ProductionPriorityId;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
};

export type MaterialLotSummary = {
  batchCode: string;
  quantity: number;
  expiryDate: string | null;
  warehouseName: string;
  usable: boolean;
};

export type MaterialCoverageStatus = "SHORTAGE" | "INCOMING_COVERS" | "TIGHT" | "COVERED";

export type MaterialRequirement = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  safetyStock: number;
  grossRequirement: number;
  available: number;
  incoming: number;
  projectedAvailable: number;
  netRequirement: number;
  shortage: boolean;
  shortagePercent: number;
  affectedOrders: AffectedProductionOrder[];
  earliestDueDate: string | null;
  urgency: MaterialRisk;
  risk: MaterialRisk;
  status: MaterialCoverageStatus;
  attention: "Procurement attention required" | null;
  lots: MaterialLotSummary[];
  leadTime: "Not available";
  purchasePrice: "Not available";
  reorderPoint: "Not available";
};

export type MaterialsKpi = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

export type MaterialsSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  view: MaterialViewId;
  kpis: MaterialsKpi[];
  materials: MaterialRequirement[];
  orders: Array<{ id: string; orderNumber: string; productName: string }>;
  orderIdsAtRisk: string[];
  emptyReason: string | null;
};
