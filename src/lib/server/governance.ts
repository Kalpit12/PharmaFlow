import type { UserRole } from "@prisma/client";

import { permissionsForRole } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/authorization";
import { ROLE_LABEL } from "@/lib/auth/identity";
import {
  buildApprovalAuthority,
  type GovernanceAuditRow,
  type GovernanceSnapshot,
  type GovernanceUserRow,
} from "@/lib/governance/types";
import { formatStateChange, writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";

const VALID_ROLES: UserRole[] = ["ADMIN", "MANAGER", "OPERATIONS", "OPERATOR", "PROCUREMENT", "QUALITY", "SALES", "VIEWER"];

function parseRole(value: string): UserRole | null {
  return VALID_ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

function summarizeAuditChange(oldValue: string | null, newValue: string | null): string {
  if (oldValue && newValue) return `${oldValue} → ${newValue}`;
  if (newValue) return newValue;
  if (oldValue) return oldValue;
  return "Recorded";
}

function mapAuditRow(row: {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: Date;
  actor: { name: string } | null;
}): GovernanceAuditRow {
  return {
    id: row.id,
    actorName: row.actor?.name ?? "System",
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    changeSummary: summarizeAuditChange(row.oldValue, row.newValue),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getGovernanceSnapshot(ctx: TenantContext): Promise<GovernanceSnapshot> {
  requirePermission(ctx, "governance.read");
  const prisma = getPrisma();
  const role = (ctx.role ?? "VIEWER") as UserRole;

  const [users, auditRows] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, email: true, role: true, status: true },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.auditLog.findMany({
      where: { tenantId: ctx.tenantId },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const userRows: GovernanceUserRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABEL[user.role] ?? user.role,
    status: user.status,
  }));

  return {
    currentRole: role,
    currentRoleLabel: ROLE_LABEL[role] ?? role,
    permissions: permissionsForRole(ctx.role),
    canManageUsers: permissionsForRole(ctx.role).includes("users.manage"),
    users: userRows,
    approvalAuthority: buildApprovalAuthority(ctx.role),
    audit: auditRows.map(mapAuditRow),
    disclaimer: "Operational governance — not enterprise IAM, SSO, or regulatory certification.",
  };
}

export async function updateUserRole(ctx: TenantContext, userId: string, nextRoleRaw: string) {
  requirePermission(ctx, "users.manage");
  const nextRole = parseRole(nextRoleRaw);
  if (!nextRole) throw new ServerError("Invalid role.", "INTERNAL");

  const prisma = getPrisma();
  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId },
    select: { id: true, role: true, email: true },
  });
  if (!target) throw new ServerError("User not found.", "NOT_FOUND");
  if (target.id === ctx.userId && nextRole !== target.role) {
    throw new ServerError("You cannot change your own role.", "FORBIDDEN");
  }
  if (target.role === nextRole) {
    return { id: target.id, role: target.role };
  }

  const change = formatStateChange("ROLE", target.role, nextRole);
  await prisma.user.update({
    where: { id: target.id },
    data: { role: nextRole },
  });

  await writeAuditLog(ctx, {
    action: "USER_ROLE_CHANGED",
    entityType: "USER",
    entityId: target.id,
    oldValue: change.oldValue,
    newValue: change.newValue,
  });

  return { id: target.id, role: nextRole };
}

export async function listAuditLogs(ctx: TenantContext, filters?: { actor?: string; action?: string; entityType?: string; q?: string }) {
  requirePermission(ctx, "audit.read");
  const where: {
    tenantId: string;
    actorUserId?: string;
    action?: { contains: string; mode: "insensitive" };
    entityType?: { contains: string; mode: "insensitive" };
    OR?: Array<{ entityId?: { contains: string; mode: "insensitive" }; newValue?: { contains: string; mode: "insensitive" } }>;
  } = { tenantId: ctx.tenantId };

  if (filters?.actor) where.actorUserId = filters.actor;
  if (filters?.action?.trim()) where.action = { contains: filters.action.trim(), mode: "insensitive" };
  if (filters?.entityType?.trim()) where.entityType = { contains: filters.entityType.trim(), mode: "insensitive" };
  if (filters?.q?.trim()) {
    const term = filters.q.trim();
    where.OR = [
      { entityId: { contains: term, mode: "insensitive" } },
      { newValue: { contains: term, mode: "insensitive" } },
    ];
  }

  const rows = await getPrisma().auditLog.findMany({
    where,
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return rows.map(mapAuditRow);
}
