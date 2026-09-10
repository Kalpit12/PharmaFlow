import type { CustomerStatus } from "@prisma/client";

import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";

export async function listCustomers(ctx: TenantContext, status?: CustomerStatus) {
  return getPrisma().customer.findMany({
    where: { tenantId: ctx.tenantId, ...(status ? { status } : {}) },
    include: { region: true },
    orderBy: { name: "asc" },
  });
}
