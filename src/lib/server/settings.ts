import { can } from "@/lib/auth/authorization";
import { ROLE_LABEL } from "@/lib/auth/identity";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";
import type { SettingsSnapshot } from "@/lib/settings/types";

export async function getSettingsSnapshot(ctx: TenantContext): Promise<SettingsSnapshot> {
  if (!ctx.userId || !ctx.role) throw new ServerError("Authentication required.", "UNAUTHORIZED");

  const [user, tenant] = await Promise.all([
    getPrisma().user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { name: true, email: true, role: true },
    }),
    getPrisma().tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, slug: true, status: true },
    }),
  ]);

  if (!user || !tenant) throw new ServerError("Workspace identity not found.", "NOT_FOUND");

  return {
    account: {
      name: user.name,
      email: user.email,
      roleLabel: ROLE_LABEL[user.role],
    },
    workspace: tenant,
    security: {
      authentication: "Credentials",
      session: "Encrypted JWT",
      mfa: "Not configured",
      sso: "Not configured",
    },
    canViewAdministration: can(ctx.role, "users.read"),
    canViewGovernance: can(ctx.role, "governance.read"),
    disclaimer: "Personal display preferences are stored in this browser. Account and security controls are read-only.",
  };
}
