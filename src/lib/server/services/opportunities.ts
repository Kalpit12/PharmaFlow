import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";

export async function listOpportunities(ctx: TenantContext) {
  return getPrisma().opportunity.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function listAttentionItems(ctx: TenantContext) {
  return getPrisma().opportunity.findMany({
    where: { tenantId: ctx.tenantId, status: { not: "CLOSED" }, priority: { in: ["HIGH", "MEDIUM"] } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}
