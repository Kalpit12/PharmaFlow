import { PrismaClient } from "@prisma/client";

import { getDashboardData } from "../src/lib/server/dashboard.ts";
import { getIsolationTenant } from "../prisma/verify-tenants.ts";

const prisma = new PrismaClient();

try {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant || tenant.status !== "DEMO") {
    throw new Error("medicrest DEMO tenant required for isolation verification.");
  }
  const tenantB = await getIsolationTenant(prisma);
  const dashboardA = await getDashboardData({ tenantId: tenant.id, userId: null, role: null });
  const dashboardB = await getDashboardData({ tenantId: tenantB.id, userId: null, role: null });

  if (dashboardA.products.some((row) => row.product.includes("Ibuprofen"))) {
    throw new Error("Tenant A dashboard leaked isolation product.");
  }
  if (!dashboardB.products.some((row) => row.product.includes("Ibuprofen"))) {
    throw new Error("Isolation tenant dashboard missing Ibuprofen product.");
  }
  if (dashboardB.products.some((row) => row.product.includes("Amoxicillin"))) {
    throw new Error("Isolation tenant leaked Tenant A product.");
  }

  console.log(`Tenant isolation verification passed (isolation slug: ${tenantB.slug}).`);
} finally {
  await prisma.$disconnect();
}
