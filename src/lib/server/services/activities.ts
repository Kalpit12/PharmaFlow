import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";

export async function listActivities(ctx: TenantContext, take = 20) {
  return getPrisma().activity.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function listRegions(ctx: TenantContext) {
  return getPrisma().region.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: "asc" },
  });
}
