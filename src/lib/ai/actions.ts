export const ACTION_TYPES = [
  "CREATE_FOLLOW_UP_TASK",
  "CREATE_SALES_OPPORTUNITY",
  "CREATE_CUSTOMER_FOLLOW_UP",
] as const;

export type ActionTypeName = (typeof ACTION_TYPES)[number];

export const ACTION_STATUSES = [
  "PROPOSED",
  "PENDING_APPROVAL",
  "APPROVED",
  "EXECUTED",
  "REJECTED",
  "FAILED",
  "CANCELLED",
] as const;

export type ActionStatusName = (typeof ACTION_STATUSES)[number];

export const ACTION_REGISTRY: Record<
  ActionTypeName,
  { label: string; description: string; expectedResult: string }
> = {
  CREATE_FOLLOW_UP_TASK: {
    label: "Create follow-up task",
    description: "Record a follow-up task against a customer.",
    expectedResult: "A tenant-scoped activity note is created.",
  },
  CREATE_SALES_OPPORTUNITY: {
    label: "Create sales opportunity",
    description: "Open a sales opportunity linked to a customer.",
    expectedResult: "An open sales opportunity and activity note are created.",
  },
  CREATE_CUSTOMER_FOLLOW_UP: {
    label: "Create customer follow-up",
    description: "Record customer follow-up in the activity timeline.",
    expectedResult: "A tenant-scoped customer follow-up activity is created.",
  },
};

export function isActionType(value: string): value is ActionTypeName {
  return (ACTION_TYPES as readonly string[]).includes(value);
}

export type ActionProposal = {
  id: string;
  type: ActionTypeName;
  title: string;
  description: string;
  reason: string;
  targetLabel: string;
  expectedResult: string;
  requiresApproval: true;
  status: ActionStatusName;
};

export type ActionListItem = {
  id: string;
  type: ActionTypeName;
  title: string;
  reason: string;
  targetLabel: string;
  status: ActionStatusName;
  proposedAt: string;
  createdByName: string;
};
