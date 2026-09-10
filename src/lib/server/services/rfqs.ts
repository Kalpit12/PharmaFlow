import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";

export async function listRfqs(ctx: TenantContext) {
  return getPrisma().rfq.findMany({
    where: { tenantId: ctx.tenantId },
    include: { customer: true, items: { include: { product: true } } },
    orderBy: { receivedAt: "desc" },
  });
}
