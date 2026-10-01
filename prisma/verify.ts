import { Prisma } from "@prisma/client";

import { periodTotals, REALIZED_ORDER_STATUSES } from "../src/lib/server/analytics";
import { trailingDays } from "../src/lib/server/dates";
import { getPrisma } from "../src/lib/server/db";
import { formatCount, formatKes } from "../src/lib/server/money";
import { getDashboardData } from "../src/lib/server/dashboard";
import { runAITool } from "../src/lib/server/ai-data";
import type { TenantContext } from "../src/lib/server/errors";
import { runPhase10Verify } from "./verify-phase10";
import { runPhase11Verify } from "./verify-phase11";
import { runPhase12_5Verify } from "./verify-phase12_5";
import { runPhase12_6Verify } from "./verify-phase12_6";
import { runPhase13Verify } from "./verify-phase13";
import { runPhase14Verify } from "./verify-phase14";
import { runPhase15Verify } from "./verify-phase15";
import { runPhase16Verify } from "./verify-phase16";
import { runPhase17Verify } from "./verify-phase17";
import { runPhase18Verify } from "./verify-phase18";
import { runPhase19Verify } from "./verify-phase19";
import { runPhase20Verify } from "./verify-phase20";
import { runPhase21Verify } from "./verify-phase21";
import { runPhase22Verify } from "./verify-phase22";
import { runPhase23Verify } from "./verify-phase23";
import { runPhase24Verify } from "./verify-phase24";
import { runPhase25Verify } from "./verify-phase25";
import { runPhase26Verify } from "./verify-phase26";
import { runPhase28Verify } from "./verify-phase28";
import { runPhase32Verify } from "./verify-phase32";
import { runPhase33Verify } from "./verify-phase33";
import { runPhase34Verify } from "./verify-phase34";
import { runPhase35Verify } from "./verify-phase35";
import { runPhase36Verify } from "./verify-phase36";
import { runPhase37Verify } from "./verify-phase37";
import { runPhase38Verify } from "./verify-phase38";

const prisma = getPrisma();

function ctx(tenantId: string): TenantContext {
  return { tenantId, userId: null, role: null };
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  if (!tenant) throw new Error("Missing demo tenant lab-allied");
  if (tenant.status !== "DEMO") throw new Error("Demo tenant must be status DEMO");

  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  if (!tenantB) throw new Error("Missing isolation tenant tenant-b-isolation");

  const [users, products, customers, regions, orders, rfqs, opportunities, activities] = await Promise.all([
    prisma.user.count({ where: { tenantId: tenant.id } }),
    prisma.product.count({ where: { tenantId: tenant.id } }),
    prisma.customer.count({ where: { tenantId: tenant.id } }),
    prisma.region.count({ where: { tenantId: tenant.id } }),
    prisma.order.findMany({ where: { tenantId: tenant.id }, include: { items: true } }),
    prisma.rfq.findMany({ where: { tenantId: tenant.id }, include: { items: true } }),
    prisma.opportunity.count({ where: { tenantId: tenant.id } }),
    prisma.activity.count({ where: { tenantId: tenant.id } }),
  ]);

  if (users < 1) throw new Error("Expected at least one user");
  if (products < 5) throw new Error("Expected demo products");
  if (customers < 4) throw new Error("Expected demo customers");
  if (regions !== 6) throw new Error("Expected six regions");
  if (orders.length < 1 || orders.some((order) => order.items.length === 0)) {
    throw new Error("Orders must include items");
  }
  if (rfqs.length < 1 || rfqs.some((rfq) => rfq.items.length === 0)) {
    throw new Error("RFQs must include items");
  }
  if (opportunities < 1 || activities < 1) throw new Error("Expected opportunities and activities");
  if (!orders.some((order) => order.status === "CANCELLED")) {
    throw new Error("Seed should include a cancelled order for exclusion checks");
  }

  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
  if (!user?.passwordHash) throw new Error("Demo user must have a passwordHash");
  if (!user.email.includes("@")) throw new Error("Demo user email missing");

  const amox = await prisma.product.findUnique({
    where: { tenantId_sku: { tenantId: tenant.id, sku: "AMOX-500-CAP" } },
  });
  if (!amox) throw new Error("Missing Amoxicillin product");

  const abcRfq = rfqs.find((rfq) => rfq.reference === "RFQ-10482");
  if (!abcRfq || abcRfq.items[0]?.quantity !== 2000) {
    throw new Error("ABC RFQ-10482 should request 2000 units");
  }

  const realized = orders.filter((order) => REALIZED_ORDER_STATUSES.includes(order.status));
  const cancelled = orders.filter((order) => order.status === "CANCELLED");
  const expectedRevenue = realized.reduce((sum, order) => sum.add(order.totalAmount), new Prisma.Decimal(0));
  const cancelledRevenue = cancelled.reduce((sum, order) => sum.add(order.totalAmount), new Prisma.Decimal(0));
  if (cancelledRevenue.lte(0)) throw new Error("Cancelled order should have a positive amount");

  const now = new Date();
  const window = trailingDays(now, 30);
  const totals = await periodTotals(ctx(tenant.id), window.start, window.end);
  const dashboardA = await getDashboardData(ctx(tenant.id), now);
  const dashboardB = await getDashboardData(ctx(tenantB.id), now);

  if (dashboardA.metrics.find((row) => row.id === "revenue")?.value !== formatKes(totals.revenue)) {
    throw new Error("Dashboard revenue does not match realized order sum");
  }
  if (dashboardA.metrics.find((row) => row.id === "orders")?.value !== formatCount(totals.orders)) {
    throw new Error("Dashboard order count does not match realized orders");
  }
  if (dashboardA.metrics.find((row) => row.id === "rfqs")?.value !== formatCount(totals.rfqs)) {
    throw new Error("Dashboard RFQ count does not match RFQs in the window");
  }
  if (dashboardA.disclaimer !== "Demo workspace data") {
    throw new Error("Demo tenant disclaimer should be Demo workspace data");
  }
  if (dashboardA.products.some((row) => row.product.includes("Ibuprofen"))) {
    throw new Error("Tenant A dashboard leaked Tenant B product");
  }
  if (!dashboardB.products.some((row) => row.product.includes("Ibuprofen"))) {
    throw new Error("Tenant B dashboard should include its own product");
  }
  if (dashboardB.products.some((row) => row.product.includes("Amoxicillin"))) {
    throw new Error("Tenant B dashboard leaked Tenant A product");
  }

  const summary = await runAITool(ctx(tenant.id), "get_business_summary", {
    timeRange: { preset: "30D", label: "last 30 days" },
  });
  if (Array.isArray(summary) || !("revenue" in summary)) throw new Error("AI business summary missing");
  if (summary.revenue !== dashboardA.metrics.find((row) => row.id === "revenue")?.value) {
    throw new Error("AI tool revenue should match dashboard revenue");
  }

  const attention = await runAITool(ctx(tenant.id), "get_attention_items", {});
  if (!Array.isArray(attention)) throw new Error("Attention items should be a list");

  console.log("Verify OK", {
    tenant: tenant.slug,
    users,
    products,
    customers,
    regions,
    orders: orders.length,
    realizedOrders: realized.length,
    cancelledOrders: cancelled.length,
    realizedRevenueAllTime: expectedRevenue.toString(),
    dashboardRevenue: dashboardA.metrics.find((row) => row.id === "revenue")?.value,
    tenantBRevenue: dashboardB.metrics.find((row) => row.id === "revenue")?.value,
    windowRevenue: totals.revenue.toString(),
  });

  try {
    await runPhase10Verify(prisma);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("workflow")) throw error;
    await runPhase10Verify(prisma);
  }
  await runPhase11Verify(prisma);
  await runPhase12_5Verify(prisma);
  await runPhase12_6Verify(prisma);
  await runPhase13Verify(prisma);
  await runPhase14Verify(prisma);
  await runPhase15Verify(prisma);
  await runPhase16Verify(prisma);
  await runPhase17Verify(prisma);
  await runPhase18Verify(prisma);
  await runPhase19Verify(prisma);
  await runPhase20Verify(prisma);
  await runPhase21Verify(prisma);
  await runPhase22Verify(prisma);
  await runPhase23Verify(prisma);
  console.log("Phase 23 verification passed.");
  await runPhase24Verify(prisma);
  console.log("Phase 24 verification passed.");
  await runPhase25Verify(prisma);
  console.log("Phase 25 verification passed.");
  await runPhase26Verify(prisma);
  console.log("Phase 26 verification passed.");
  await runPhase28Verify(prisma);
  await runPhase32Verify(prisma);
  await runPhase33Verify(prisma);
  await runPhase34Verify(prisma);
  await runPhase35Verify(prisma);
  await runPhase36Verify(prisma);
  await runPhase37Verify(prisma);
  await runPhase38Verify(prisma);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Verification failed.");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
