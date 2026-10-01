import type { UserRole } from "@prisma/client";

import { APPROVAL_AUTHORITY, permissionsForRole, type Permission } from "@/lib/auth/permissions";
import { ROLE_LABEL } from "@/lib/auth/identity";

export type GovernanceUserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  status: "ACTIVE" | "INACTIVE";
};

export type GovernanceAuditRow = {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  changeSummary: string;
  reason: string | null;
  createdAt: string;
};

export type GovernanceSnapshot = {
  currentRole: UserRole;
  currentRoleLabel: string;
  permissions: Permission[];
  canManageUsers: boolean;
  users: GovernanceUserRow[];
  approvalAuthority: Array<{ capability: string; permitted: boolean }>;
  audit: GovernanceAuditRow[];
  disclaimer: string;
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABEL[role] ?? role;
}

export function buildApprovalAuthority(role: string | null) {
  return APPROVAL_AUTHORITY.map((row) => ({
    capability: row.capability,
    permitted: permissionsForRole(role).includes(row.permission),
  }));
}
