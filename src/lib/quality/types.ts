import type { BatchQualityStatus } from "@/lib/batches/types";
import type { TraceabilityImpactSummary } from "@/lib/traceability/types";

export const QUALITY_EXCEPTION_TYPES = [
  "NON_CONFORMANCE",
  "DEVIATION",
  "QUALITY_INCIDENT",
  "MATERIAL_ISSUE",
  "BATCH_ISSUE",
  "DOCUMENTATION_ISSUE",
  "OTHER",
] as const;
export type QualityExceptionType = (typeof QUALITY_EXCEPTION_TYPES)[number];

export const QUALITY_EXCEPTION_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type QualityExceptionSeverity = (typeof QUALITY_EXCEPTION_SEVERITIES)[number];

export const QUALITY_EXCEPTION_STATUSES = [
  "OPEN",
  "INVESTIGATING",
  "ACTION_REQUIRED",
  "RESOLVED",
  "CLOSED",
] as const;
export type QualityExceptionStatus = (typeof QUALITY_EXCEPTION_STATUSES)[number];

export const QUALITY_CORRECTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED"] as const;
export type QualityCorrectiveActionStatus = (typeof QUALITY_CORRECTIVE_STATUSES)[number];

export const QUALITY_VIEWS = ["all", "open", "critical", "overdue", "unassigned"] as const;
export type QualityViewId = (typeof QUALITY_VIEWS)[number];

export const DUE_STATES = ["ON_TRACK", "DUE_SOON", "OVERDUE", "NO_DUE_DATE"] as const;
export type DueState = (typeof DUE_STATES)[number];

export type QualityCorrectiveActionRow = {
  id: string;
  description: string;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  status: QualityCorrectiveActionStatus;
  completedAt: string | null;
  createdAt: string;
};

export type QualityTimelineEvent = {
  id: string;
  eventType: string;
  label: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
};

export type QualityEntityLink = {
  batchId: string | null;
  batchNumber: string | null;
  batchQualityStatus: BatchQualityStatus | null;
  productionOrderId: string | null;
  orderNumber: string | null;
  productId: string | null;
  productName: string | null;
  inventoryLotId: string | null;
  lotCode: string | null;
  orderId: string | null;
  orderReference: string | null;
  customerId: string | null;
  customerName: string | null;
  entityLabel: string;
};

export type QualityExceptionRow = {
  id: string;
  reference: string;
  title: string;
  description: string;
  type: QualityExceptionType;
  severity: QualityExceptionSeverity;
  status: QualityExceptionStatus;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  dueState: DueState;
  ageDays: number;
  investigationNotes: string | null;
  findings: string | null;
  resolutionNotes: string | null;
  entity: QualityEntityLink;
  correctiveActions: QualityCorrectiveActionRow[];
  timeline: QualityTimelineEvent[];
  traceabilityImpact: TraceabilityImpactSummary | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  allowedTransitions: QualityExceptionStatus[];
};

export type QualityAttentionItem = {
  id: string;
  severity: "CRITICAL" | "HIGH" | "WARNING";
  title: string;
  detail: string;
  href: string;
};

export type QualityDistributionSlice = {
  label: string;
  value: number;
};

export type QualityKpi = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

export type QualitySnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  view: QualityViewId;
  kpis: QualityKpi[];
  exceptions: QualityExceptionRow[];
  attention: QualityAttentionItem[];
  severityDistribution: QualityDistributionSlice[];
  statusDistribution: QualityDistributionSlice[];
  ownerOptions: Array<{ id: string; name: string }>;
  emptyReason: string | null;
  capabilities: {
    canManage: boolean;
  };
  batchOptions: Array<{ id: string; batchNumber: string; productName: string }>;
};

export type CreateQualityExceptionInput = {
  title: string;
  description: string;
  type: QualityExceptionType;
  severity: QualityExceptionSeverity;
  ownerId?: string | null;
  dueDate?: string | null;
  productionBatchId?: string | null;
  productionOrderId?: string | null;
  inventoryLotId?: string | null;
  productId?: string | null;
  orderId?: string | null;
  customerId?: string | null;
};

export type UpdateQualityExceptionInput = {
  title?: string;
  description?: string;
  type?: QualityExceptionType;
  severity?: QualityExceptionSeverity;
  ownerId?: string | null;
  dueDate?: string | null;
  investigationNotes?: string | null;
  findings?: string | null;
  resolutionNotes?: string | null;
};

export type CreateCorrectiveActionInput = {
  description: string;
  ownerId?: string | null;
  dueDate?: string | null;
};

export type UpdateCorrectiveActionInput = {
  description?: string;
  ownerId?: string | null;
  dueDate?: string | null;
  status?: QualityCorrectiveActionStatus;
};
