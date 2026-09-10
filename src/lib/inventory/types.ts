import type { BatchExpiryStatus, InventoryHealth, ReportRisk } from "@/lib/reports/risk";
import type { BucketRow, InventoryClassId } from "@/lib/reports/types";

export const INVENTORY_VIEWS = ["overview", "health", "expiry", "ageing", "requirements"] as const;
export type InventoryViewId = (typeof INVENTORY_VIEWS)[number];

export type InventoryKpi = {
  id: string;
  label: string;
  value: string;
  hint: string;
  risk: ReportRisk;
  href: string;
};

export type InventoryBatch = {
  id: string;
  batchCode: string;
  quantity: number;
  receivedAt: string;
  expiryDate: string | null;
  daysRemaining: number | null;
  ageDays: number;
  expiryBucket: string | null;
  ageingBucket: string;
  expiryStatus: BatchExpiryStatus | null;
  warehouseName: string;
  supplierName: string | null;
};

export type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  classId: InventoryClassId;
  onHand: number;
  safetyStock: number;
  inTransit: number;
  available: number;
  projected: number;
  required: number;
  shortfall: number;
  productionNeed: number;
  hasBom: boolean;
  health: InventoryHealth;
  nearestExpiry: string | null;
  daysRemaining: number | null;
  batchCount: number;
  suppliers: string[];
  orders: Array<{ id: string; orderNumber: string; quantity: number; status: string; workstationName: string | null }>;
  batches: InventoryBatch[];
};

export type InventoryCategoryRow = {
  id: InventoryClassId;
  label: string;
  items: number;
  quantity: number;
  low: number;
  critical: number;
  expiryRisk: number;
};

export type InventorySnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  view: InventoryViewId;
  kpis: InventoryKpi[];
  findings: string[];
  health: Array<{ id: InventoryHealth; label: string; count: number; quantity: number }>;
  categories: InventoryCategoryRow[];
  expiryBuckets: BucketRow[];
  ageingBuckets: BucketRow[];
  items: InventoryItem[];
  expiredQty: number;
  expiringSoonQty: number;
  expiredShare: number;
  expiredItems: number;
  expiredBatches: number;
};
