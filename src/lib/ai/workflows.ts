import { ACTION_REGISTRY, type ActionTypeName } from "@/lib/ai/actions";

export const WORKFLOW_TYPES = [
  "RFQ_FOLLOW_UP",
  "CUSTOMER_REENGAGEMENT",
  "SALES_OPPORTUNITY_FOLLOW_UP",
] as const;

export type WorkflowTypeName = (typeof WORKFLOW_TYPES)[number];

export const WORKFLOW_STATUSES = [
  "PROPOSED",
  "PENDING_APPROVAL",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "REJECTED",
  "CANCELLED",
] as const;

export type WorkflowStatusName = (typeof WORKFLOW_STATUSES)[number];

export type WorkflowDefinition = {
  type: WorkflowTypeName;
  title: string;
  description: string;
  requiredContext: "CUSTOMER" | "CUSTOMER_AND_OPPORTUNITY";
  steps: ActionTypeName[];
};

export const WORKFLOW_REGISTRY: Record<WorkflowTypeName, WorkflowDefinition> = {
  RFQ_FOLLOW_UP: {
    type: "RFQ_FOLLOW_UP",
    title: "RFQ follow-up",
    description: "Create a customer follow-up and a sales opportunity from RFQ activity.",
    requiredContext: "CUSTOMER",
    steps: ["CREATE_CUSTOMER_FOLLOW_UP", "CREATE_SALES_OPPORTUNITY"],
  },
  CUSTOMER_REENGAGEMENT: {
    type: "CUSTOMER_REENGAGEMENT",
    title: "Customer re-engagement",
    description: "Create a follow-up task for a customer that needs attention.",
    requiredContext: "CUSTOMER",
    steps: ["CREATE_FOLLOW_UP_TASK"],
  },
  SALES_OPPORTUNITY_FOLLOW_UP: {
    type: "SALES_OPPORTUNITY_FOLLOW_UP",
    title: "Sales opportunity follow-up",
    description: "Create a follow-up task against an existing sales opportunity.",
    requiredContext: "CUSTOMER_AND_OPPORTUNITY",
    steps: ["CREATE_FOLLOW_UP_TASK"],
  },
};

export function isWorkflowType(value: string): value is WorkflowTypeName {
  return (WORKFLOW_TYPES as readonly string[]).includes(value);
}

export function workflowStepLabels(type: WorkflowTypeName): string[] {
  return WORKFLOW_REGISTRY[type].steps.map((step) => ACTION_REGISTRY[step].label);
}

export type WorkflowProposal = {
  id: string;
  type: WorkflowTypeName;
  title: string;
  description: string;
  reason: string;
  targetLabel: string;
  steps: string[];
  requiresApproval: true;
  status: WorkflowStatusName;
};

export type WorkflowListItem = {
  id: string;
  type: WorkflowTypeName;
  title: string;
  reason: string;
  targetLabel: string;
  status: WorkflowStatusName;
  proposedAt: string;
  createdByName: string;
  reviewerName: string | null;
  steps: string[];
};

export function parseModelWorkflow(
  raw: unknown
): { type: string; title: string; reason: string; targetName: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = typeof row.type === "string" ? row.type : "";
  if (type === "NONE" || !isWorkflowType(type)) return null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const reason = typeof row.reason === "string" ? row.reason.trim() : "";
  const targetName = typeof row.targetName === "string" ? row.targetName.trim() : "";
  if (!title || !reason || !targetName) return null;
  return { type, title, reason, targetName };
}
