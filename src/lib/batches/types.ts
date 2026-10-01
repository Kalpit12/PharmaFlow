import type { ProductionOrderStatus } from "@prisma/client";

export const BATCH_QUALITY_STATUSES = ["PENDING_REVIEW", "ON_HOLD", "RELEASED", "REJECTED"] as const;
export type BatchQualityStatus = (typeof BATCH_QUALITY_STATUSES)[number];

export const BATCH_QUALITY_ACTIONS = ["HOLD", "RELEASE", "REJECT"] as const;
export type BatchQualityAction = (typeof BATCH_QUALITY_ACTIONS)[number];

export const BATCH_QUALITY_VIEWS = ["all", "review", "hold", "released", "rejected"] as const;
export type BatchQualityViewId = (typeof BATCH_QUALITY_VIEWS)[number];

export const HOLD_REASON_PRESETS = [
  "Awaiting laboratory result",
  "Packaging inspection",
  "Documentation review",
  "Material discrepancy",
  "Manufacturing exception",
  "Other",
] as const;

export type BatchMaterialTraceRow = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  requiredQuantity: number;
  lotCode: string | "NOT_RECORDED";
  quantityUsed: number | "NOT_RECORDED";
};

export type BatchQualityEventRow = {
  id: string;
  action: BatchQualityAction;
  reason: string | null;
  actorName: string | null;
  createdAt: string;
};

export type BatchRow = {
  id: string;
  batchNumber: string;
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  productionOrderId: string;
  orderNumber: string;
  manufacturingStatus: ProductionOrderStatus;
  qualityStatus: BatchQualityStatus;
  plannedQuantity: number;
  producedQuantity: number | null;
  producedLabel: string;
  remainingQuantity: number | null;
  completionPercent: number | null;
  holdReason: string | null;
  reviewOwnerName: string | null;
  lastQualityAction: BatchQualityAction | null;
  lastQualityActionAt: string | null;
  lastQualityActionByName: string | null;
  risk: "CRITICAL" | "HIGH" | "WARNING" | "OK";
  createdAt: string;
  updatedAt: string;
  productionStartedAt: string | null;
  productionCompletedAt: string | null;
  canHold: boolean;
  canRelease: boolean;
  canReject: boolean;
  materialTrace: BatchMaterialTraceRow[];
  qualityEvents: BatchQualityEventRow[];
};

export type BatchesKpi = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

export type BatchAttentionItem = {
  id: string;
  severity: "CRITICAL" | "HIGH" | "WARNING";
  title: string;
  detail: string;
  href: string;
};

export type BatchesSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  view: BatchQualityViewId;
  kpis: BatchesKpi[];
  batches: BatchRow[];
  attention: BatchAttentionItem[];
  emptyReason: string | null;
  capabilities: {
    canQualityAction: boolean;
  };
};
