import type { PrismaClient, Tenant } from "@prisma/client";

/** Legacy slug used when it is a DEMO tenant. */
export const LEGACY_ISOLATION_SLUG = "tenant-b-isolation";

/** DEMO-only isolation tenant when legacy slug is occupied by a non-DEMO tenant. */
export const DEMO_ISOLATION_SLUG = "tenant-b-demo-isolation";

/**
 * Resolves the tenant used for cross-tenant isolation checks.
 * Never mutates tenants — callers must seed via ensure-verify-prerequisites.
 */
export async function getIsolationTenant(prisma: PrismaClient): Promise<Tenant> {
  const legacy = await prisma.tenant.findUnique({ where: { slug: LEGACY_ISOLATION_SLUG } });
  if (legacy?.status === "DEMO") return legacy;

  const demo = await prisma.tenant.findUnique({ where: { slug: DEMO_ISOLATION_SLUG } });
  if (demo?.status === "DEMO") return demo;

  if (legacy) {
    throw new Error(
      `${LEGACY_ISOLATION_SLUG} exists with status ${legacy.status} (not DEMO). ` +
        `Run npm run db:seed:verify to create ${DEMO_ISOLATION_SLUG}, or point DATABASE_URL at a verification database.`
    );
  }

  throw new Error(`Missing DEMO isolation tenant (${LEGACY_ISOLATION_SLUG} or ${DEMO_ISOLATION_SLUG}).`);
}

export async function pingDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
