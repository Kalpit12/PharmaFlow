import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { ServerError, type TenantContext } from "@/lib/server/errors";

export function requireAuthenticated(ctx: TenantContext): string {
  if (!ctx.userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  return ctx.userId;
}

export function requirePermission(ctx: TenantContext, permission: Permission): void {
  requireAuthenticated(ctx);
  if (!hasPermission(ctx.role, permission)) {
    throw new ServerError("You do not have permission to perform this action.", "FORBIDDEN");
  }
}

export function can(role: string | null, permission: Permission): boolean {
  return hasPermission(role, permission);
}

/** Action and workflow approval authority (Phase 9 compatibility). */
export function canApprove(role: string | null): boolean {
  return hasPermission(role, "actions.approve");
}

/** Procurement review, award, and PO approval authority. */
export function canProcurementApprove(role: string | null): boolean {
  return hasPermission(role, "procurement.approve");
}
