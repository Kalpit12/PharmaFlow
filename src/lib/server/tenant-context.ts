import { auth } from "@/auth";
import { isTenantAccessible, type AuthenticatedUser } from "@/lib/auth/identity";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";

/**
 * @deprecated Temporary development fallback. Prefer getAuthenticatedTenantContext().
 * Never trust a client-supplied tenantId as ownership proof.
 */
export async function resolveDevTenantContext(): Promise<TenantContext> {
  const slug = process.env.DEMO_TENANT_SLUG ?? "lab-allied";
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    throw new ServerError("Demo tenant is not seeded.", "NOT_FOUND");
  }

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: process.env.AUTH_DEV_EMAIL ?? "alex@laballied.demo" },
  });

  return {
    tenantId: tenant.id,
    userId: user?.id ?? null,
    role: user?.role ?? null,
  };
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser?.id || !sessionUser.email) {
    throw new ServerError("Authentication required.", "UNAUTHORIZED");
  }

  const user = await getPrisma().user.findUnique({
    where: { id: sessionUser.id },
    include: { tenant: true },
  });

  if (!user || user.email !== sessionUser.email) {
    throw new ServerError("Authentication required.", "UNAUTHORIZED");
  }
  if (user.status !== "ACTIVE") {
    throw new ServerError("This account is inactive.", "FORBIDDEN");
  }
  if (!isTenantAccessible(user.tenant.status)) {
    throw new ServerError("This workspace is unavailable.", "FORBIDDEN");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
  };
}

/**
 * Server source of truth. Session cookie is only a pointer;
 * tenantId / userId / role are loaded from the database, never from the client.
 */
export async function getAuthenticatedTenantContext(): Promise<TenantContext> {
  const user = await getAuthenticatedUser();
  return {
    tenantId: user.tenantId,
    userId: user.id,
    role: user.role,
  };
}

export function assertTenantScope(ctx: TenantContext, tenantId: string): void {
  if (ctx.tenantId !== tenantId) {
    throw new ServerError("Tenant scope mismatch.", "FORBIDDEN");
  }
}
