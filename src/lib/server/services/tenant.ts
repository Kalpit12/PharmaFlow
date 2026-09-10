import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";

export async function getTenant(ctx: TenantContext) {
  const tenant = await getPrisma().tenant.findUnique({ where: { id: ctx.tenantId } });
  if (!tenant) throw new ServerError("Tenant not found.", "NOT_FOUND");
  return tenant;
}

export async function getTenantBySlug(slug: string) {
  return getPrisma().tenant.findUnique({ where: { slug } });
}
