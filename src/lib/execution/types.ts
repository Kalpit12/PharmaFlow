export const EXECUTION_KINDS = ["ACTION", "WORKFLOW", "REQUISITION", "COMMUNICATION", "PURCHASE_ORDER"] as const;
export type ExecutionKind = (typeof EXECUTION_KINDS)[number];

export const EXECUTION_DOMAINS = [
  "sales",
  "customers",
  "operations",
  "materials",
  "procurement",
  "communications",
] as const;
export type ExecutionDomain = (typeof EXECUTION_DOMAINS)[number];

export const EXECUTION_FILTERS = ["all", "needs-review", "ready", "executed", "rejected", "failed"] as const;
export type ExecutionFilterId = (typeof EXECUTION_FILTERS)[number];

export const EXECUTION_PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type ExecutionPriority = (typeof EXECUTION_PRIORITIES)[number];

/** Unified queue status used for filtering — maps from underlying domain statuses. */
export type ExecutionQueueStatus =
  | "NEEDS_REVIEW"
  | "READY"
  | "EXECUTED"
  | "REJECTED"
  | "FAILED"
  | "BLOCKED";

export type ExecutionItem = {
  id: string;
  kind: ExecutionKind;
  domain: ExecutionDomain;
  priority: ExecutionPriority;
  title: string;
  reason: string;
  recommendedAction: string;
  status: ExecutionQueueStatus;
  sourceStatus: string;
  targetLabel: string;
  createdAt: string;
  createdByName: string;
  sourceHref: string;
  /** True when Approve/Reject can call an existing server execution path. */
  executable: boolean;
  /** True when Approve is available for current user role (server-enforced still). */
  canDecide: boolean;
  safetyNote: string;
  preparedSummary: string;
  impactSummary: string;
  steps?: string[];
};

export type ExecutionKpis = {
  needsReview: number;
  ready: number;
  executedToday: number;
  blockedOrFailed: number;
};

export type ExecutionSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  canApprove: boolean;
  kpis: ExecutionKpis;
  queue: ExecutionItem[];
  history: ExecutionItem[];
  emptyReason: string | null;
  planningNote: string;
};
