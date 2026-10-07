export const EXECUTION_STATES = [
  "WAITING",
  "RELEASED",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
] as const;

export type ExecutionState = (typeof EXECUTION_STATES)[number];

export const EXECUTION_RISKS = ["ON_TRACK", "AT_RISK", "LATE", "BLOCKED", "UNKNOWN"] as const;
export type ExecutionRisk = (typeof EXECUTION_RISKS)[number];

export const EXECUTION_VIEWS = [
  "all",
  "active",
  "paused",
  "waiting",
  "completed",
  "at-risk",
] as const;
export type ExecutionViewId = (typeof EXECUTION_VIEWS)[number];

export const EXECUTION_AUDIT_ACTIONS = [
  "PRODUCTION_RELEASE",
  "PRODUCTION_START",
  "PRODUCTION_PAUSE",
  "PRODUCTION_RESUME",
  "PRODUCTION_COMPLETE",
] as const;
export type ExecutionAuditAction = (typeof EXECUTION_AUDIT_ACTIONS)[number];

export type ExecutionHistoryEntry = {
  id: string;
  action: ExecutionAuditAction;
  label: string;
  actorName: string | null;
  at: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
};

export type ExecutionAttentionItem = {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  detail: string;
  consequence: string;
  href: string;
};

export type ExecutionOrderRow = {
  id: string;
  orderNumber: string;
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  workstationId: string | null;
  workstationName: string | null;
  workstationActive: boolean | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  planningStatus: string;
  executionState: ExecutionState;
  plannedQuantity: number;
  producedQuantity: number | null;
  remainingQuantity: number | null;
  progressPercent: number | null;
  progressLabel: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualCompletion: string | null;
  plannedDurationMinutes: number | null;
  actualDurationMinutes: number | null;
  durationVarianceMinutes: number | null;
  quantityVariance: number | null;
  risk: ExecutionRisk;
  riskEvidence: string;
  batchId: string | null;
  batchNumber: string | null;
  materialReadiness: string | null;
  isReleased: boolean;
  isPaused: boolean;
  canRelease: boolean;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canComplete: boolean;
  history: ExecutionHistoryEntry[];
};

export type ExecutionKpi = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger" | "warning" | "success" | "primary" | "material";
};

export type ExecutionPerformanceRow = {
  id: string;
  label: string;
  planned: number | null;
  actual: number | null;
  unit: "minutes" | "quantity";
};

export type ProductionExecutionSnapshot = {
  asOf: string;
  view: ExecutionViewId;
  disclaimer: string;
  kpis: ExecutionKpi[];
  orders: ExecutionOrderRow[];
  attention: ExecutionAttentionItem[];
  performance: ExecutionPerformanceRow[];
  workstations: Array<{ id: string; name: string; code: string }>;
  workstationId: string | null;
  nextTask: ExecutionOrderRow | null;
  capabilities: {
    canExecute: boolean;
    canRead: boolean;
  };
};
