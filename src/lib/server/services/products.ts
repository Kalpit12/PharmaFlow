import type { ProductStatus } from "@prisma/client";

import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";

export async function listProducts(ctx: TenantContext, status?: ProductStatus) {
  return getPrisma().product.findMany({
    where: { tenantId: ctx.tenantId, ...(status ? { status } : {}) },
    orderBy: { name: "asc" },
  });
}

export async function getProductBySku(ctx: TenantContext, sku: string) {
  return getPrisma().product.findUnique({
    where: { tenantId_sku: { tenantId: ctx.tenantId, sku } },
  });
}
