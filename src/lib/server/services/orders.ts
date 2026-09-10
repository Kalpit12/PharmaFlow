import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";

export async function listOrders(ctx: TenantContext) {
  return getPrisma().order.findMany({
    where: { tenantId: ctx.tenantId },
    include: { customer: true, items: { include: { product: true } } },
    orderBy: { orderedAt: "desc" },
  });
}
