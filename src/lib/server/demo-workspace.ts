import { cookies } from "next/headers";

import type { AuthenticatedUser } from "@/lib/auth/identity";
import { DEMO_TENANT_SLUG_COOKIE, isSwitchableDemoTenantSlug } from "@/lib/demo-workspaces";
import { getPrisma } from "@/lib/server/db";

/** Resolve demo tenant override from workspace switcher cookie (DEMO tenants only). */
export async function resolveDemoTenantId(user: AuthenticatedUser): Promise<string | null> {
  const jar = await cookies();
  const slug = jar.get(DEMO_TENANT_SLUG_COOKIE)?.value?.trim();
  if (!slug || !isSwitchableDemoTenantSlug(slug)) return null;

  const prisma = getPrisma();
  const [home, target] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { status: true, slug: true } }),
    prisma.tenant.findUnique({ where: { slug }, select: { id: true, status: true } }),
  ]);
  if (home?.status !== "DEMO" || target?.status !== "DEMO") return null;

  return target.id;
}
