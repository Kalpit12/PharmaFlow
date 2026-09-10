import { Prisma, type OrderStatus, type RFQStatus } from "@prisma/client";

import { addUtcDays, addUtcMonths, trailingDays, utcDayStart, utcMonthStart } from "@/lib/server/dates";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ZERO, asDecimal, percentChange } from "@/lib/server/money";

/** Realized revenue: confirmed and fulfilled only. Draft and cancelled are excluded. */
export const REALIZED_ORDER_STATUSES: OrderStatus[] = ["CONFIRMED", "FULFILLED"];

const OPEN_RFQ: RFQStatus[] = ["NEW", "IN_REVIEW"];

export type PeriodTotals = {
  revenue: Prisma.Decimal;
  orders: number;
  rfqs: number;
  customers: number;
};

export type ProductAgg = {
  productId: string;
  name: string;
  form: string;
  units: number;
  revenue: Prisma.Decimal;
    previousUnits: number;
};

export type RegionAgg = {
  regionId: string;
  country: string;
  revenue: Prisma.Decimal;
  orders: number;
  customerCount: number;
  previousRevenue: Prisma.Decimal | null;
};

export type ComputedAttention = {
  id: string;
  severity: "High" | "Medium";
  title: string;
  detail: string;
  meta: string;
  actionLabel: string;
  href: string;
};

export type ComputedOpportunity = {
  id: string;
  category: string;
  insight: string;
  action: string;
  href: string;
};

export type BucketPoint = {
  label: string;
  start: Date;
  end: Date;
  revenue: Prisma.Decimal;
  orders: number;
  rfqs: number;
};

function tenantOrderWhere(tenantId: string, start: Date, end: Date) {
  return {
    tenantId,
    status: { in: REALIZED_ORDER_STATUSES },
    orderedAt: { gte: start, lt: end },
  };
}

export async function periodTotals(ctx: TenantContext, start: Date, end: Date): Promise<PeriodTotals> {
  const prisma = getPrisma();
  const [orderAgg, rfqs, customers] = await Promise.all([
    prisma.order.aggregate({
      where: tenantOrderWhere(ctx.tenantId, start, end),
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.rfq.count({
      where: { tenantId: ctx.tenantId, receivedAt: { gte: start, lt: end } },
    }),
    prisma.customer.count({
      where: { tenantId: ctx.tenantId, status: "ACTIVE", createdAt: { lt: end } },
    }),
  ]);

  return {
    revenue: asDecimal(orderAgg._sum.totalAmount),
    orders: orderAgg._count,
    rfqs,
    customers,
  };
}

export async function productAggregates(ctx: TenantContext, current: { start: Date; end: Date }, previous: { start: Date; end: Date }): Promise<ProductAgg[]> {
  const prisma = getPrisma();
  const products = await prisma.product.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
  if (products.length === 0) return [];

  const [currentRows, previousRows] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: { order: tenantOrderWhere(ctx.tenantId, current.start, current.end) },
      _sum: { quantity: true, totalAmount: true },
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: { order: tenantOrderWhere(ctx.tenantId, previous.start, previous.end) },
      _sum: { quantity: true },
    }),
  ]);

  const currentMap = new Map(currentRows.map((row) => [row.productId, row]));
  const previousMap = new Map(previousRows.map((row) => [row.productId, row]));

  return products.map((product) => {
    const now = currentMap.get(product.id);
    const prior = previousMap.get(product.id);
    return {
      productId: product.id,
      name: product.name,
      form: product.dosageForm ?? "—",
      units: now?._sum.quantity ?? 0,
      revenue: asDecimal(now?._sum.totalAmount),
      previousUnits: prior?._sum.quantity ?? 0,
    };
  });
}

export async function regionAggregates(ctx: TenantContext, current: { start: Date; end: Date }, previous: { start: Date; end: Date }): Promise<RegionAgg[]> {
  const prisma = getPrisma();
  const regions = await prisma.region.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: "asc" },
  });
  if (regions.length === 0) return [];

  const [currentOrders, previousOrders, customers] = await Promise.all([
    prisma.order.findMany({
      where: tenantOrderWhere(ctx.tenantId, current.start, current.end),
      select: { totalAmount: true, customer: { select: { regionId: true } } },
    }),
    prisma.order.findMany({
      where: tenantOrderWhere(ctx.tenantId, previous.start, previous.end),
      select: { totalAmount: true, customer: { select: { regionId: true } } },
    }),
    prisma.customer.groupBy({
      by: ["regionId"],
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      _count: true,
    }),
  ]);

  const rollup = (rows: typeof currentOrders) => {
    const map = new Map<string, { revenue: Prisma.Decimal; orders: number }>();
    for (const row of rows) {
      const key = row.customer.regionId ?? "_none";
      const entry = map.get(key) ?? { revenue: ZERO, orders: 0 };
      entry.revenue = entry.revenue.add(row.totalAmount);
      entry.orders += 1;
      map.set(key, entry);
    }
    return map;
  };

  const currentMap = rollup(currentOrders);
  const previousMap = rollup(previousOrders);
  const customerMap = new Map(customers.map((row) => [row.regionId ?? "_none", row._count]));

  return regions
    .map((region) => {
      const now = currentMap.get(region.id) ?? { revenue: ZERO, orders: 0 };
      const prior = previousMap.get(region.id);
      return {
        regionId: region.id,
        country: region.country,
        revenue: now.revenue,
        orders: now.orders,
        customerCount: customerMap.get(region.id) ?? 0,
        previousRevenue: prior ? prior.revenue : ZERO,
      };
    })
    .sort((a, b) => Number(b.revenue.cmp(a.revenue)));
}

async function fillBuckets(
  ctx: TenantContext,
  buckets: { label: string; start: Date; end: Date }[]
): Promise<BucketPoint[]> {
  const prisma = getPrisma();
  const start = buckets[0]?.start;
  const end = buckets[buckets.length - 1]?.end;
  if (!start || !end) return [];

  const [orders, rfqs] = await Promise.all([
    prisma.order.findMany({
      where: tenantOrderWhere(ctx.tenantId, start, end),
      select: { orderedAt: true, totalAmount: true },
    }),
    prisma.rfq.findMany({
      where: { tenantId: ctx.tenantId, receivedAt: { gte: start, lt: end } },
      select: { receivedAt: true },
    }),
  ]);

  return buckets.map((bucket) => {
    let revenue = ZERO;
    let orderCount = 0;
    for (const order of orders) {
      if (order.orderedAt >= bucket.start && order.orderedAt < bucket.end) {
        revenue = revenue.add(order.totalAmount);
        orderCount += 1;
      }
    }
    const rfqCount = rfqs.filter((row) => row.receivedAt >= bucket.start && row.receivedAt < bucket.end).length;
    return { ...bucket, revenue, orders: orderCount, rfqs: rfqCount };
  });
}

export async function salesBuckets(ctx: TenantContext, range: "7D" | "30D" | "90D" | "12M", now = new Date()): Promise<BucketPoint[]> {
  const end = now;

  if (range === "7D") {
    const start = utcDayStart(addUtcDays(end, -6));
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const day = addUtcDays(start, index);
      return {
        label: day.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
        start: day,
        end: addUtcDays(day, 1),
      };
    });
    return fillBuckets(ctx, buckets);
  }

  if (range === "30D") {
    const start = utcDayStart(addUtcDays(end, -30));
    const buckets = Array.from({ length: 5 }, (_, index) => {
      const bucketStart = addUtcDays(start, index * 6);
      const bucketEnd = index === 4 ? end : addUtcDays(start, (index + 1) * 6);
      return { label: `W${index + 1}`, start: bucketStart, end: bucketEnd };
    });
    return fillBuckets(ctx, buckets);
  }

  if (range === "90D") {
    const month0 = utcMonthStart(addUtcMonths(end, -2));
    const buckets = [0, 1, 2].map((offset) => {
      const start = addUtcMonths(month0, offset);
      const next = addUtcMonths(month0, offset + 1);
      return {
        label: start.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
        start,
        end: offset === 2 ? end : next,
      };
    });
    return fillBuckets(ctx, buckets);
  }

  const month0 = utcMonthStart(addUtcMonths(end, -11));
  const buckets = Array.from({ length: 12 }, (_, offset) => {
    const start = addUtcMonths(month0, offset);
    const next = addUtcMonths(month0, offset + 1);
    return {
      label: start.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      start,
      end: offset === 11 ? end : next,
    };
  });
  return fillBuckets(ctx, buckets);
}

export async function computeAttention(ctx: TenantContext, now = new Date()): Promise<ComputedAttention[]> {
  const prisma = getPrisma();
  const items: ComputedAttention[] = [];
  const openRfqs = await prisma.rfq.findMany({
    where: { tenantId: ctx.tenantId, status: { in: OPEN_RFQ } },
    include: { customer: true, items: { include: { product: true } } },
    orderBy: { receivedAt: "desc" },
    take: 5,
  });

  for (const rfq of openRfqs) {
    const overdue = rfq.dueAt && rfq.dueAt < now;
    const units = rfq.items.reduce((sum, item) => sum + item.quantity, 0);
    const product = rfq.items[0]?.product.name ?? "products";
    items.push({
      id: `rfq-${rfq.id}`,
      severity: overdue || rfq.status === "NEW" ? "High" : "Medium",
      title: rfq.customer.name,
      detail: `RFQ ${rfq.reference} — ${units.toLocaleString("en-KE")} units of ${product}`,
      meta: overdue ? "Due date passed" : rfq.status === "NEW" ? "New" : "In review",
      actionLabel: "Review RFQ",
      href: "/rfqs",
    });
  }

  const cutoff = addUtcDays(now, -45);
  const customers = await prisma.customer.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    include: {
      orders: {
        where: { status: { in: REALIZED_ORDER_STATUSES } },
        orderBy: { orderedAt: "desc" },
        take: 1,
        select: { orderedAt: true },
      },
    },
  });

  const inactive = customers.filter((customer) => {
    const last = customer.orders[0]?.orderedAt;
    return !last || last < cutoff;
  });

  if (inactive.length > 0) {
    items.push({
      id: "inactive-customers",
      severity: "Medium",
      title: "Customer follow-up",
      detail: `${inactive.length} active account${inactive.length === 1 ? "" : "s"} with no realized order in 45 days`,
      meta: "Commercial",
      actionLabel: "Review customers",
      href: "/customers",
    });
  }

  return items.slice(0, 6);
}

export async function computeOpportunities(
  ctx: TenantContext,
  products: ProductAgg[],
  regions: RegionAgg[],
  attention: ComputedAttention[]
): Promise<ComputedOpportunity[]> {
  const items: ComputedOpportunity[] = [];
  const growing = products
    .filter((row) => row.previousUnits > 0 && row.units > row.previousUnits)
    .sort((a, b) => b.units - a.units)[0];

  if (growing && growing.previousUnits) {
    const change = percentChange(new Prisma.Decimal(growing.units), new Prisma.Decimal(growing.previousUnits));
    items.push({
      id: `demand-${growing.productId}`,
      category: "Demand",
      insight: `${growing.name} unit volume is ${change.text} versus the prior 30 days.`,
      action: "Review inventory cover and distributor demand.",
      href: "/products",
    });
  }

  const inactive = attention.find((item) => item.id === "inactive-customers");
  if (inactive) {
    items.push({
      id: "retention",
      category: "Retention",
      insight: inactive.detail,
      action: "Launch targeted follow-up this week.",
      href: "/customers",
    });
  }

  const growingRegion = regions.find((row) => row.previousRevenue && row.previousRevenue.gt(0) && row.revenue.gt(row.previousRevenue));
  if (growingRegion && growingRegion.previousRevenue) {
    const change = percentChange(growingRegion.revenue, growingRegion.previousRevenue);
    items.push({
      id: `region-${growingRegion.regionId}`,
      category: "Region",
      insight: `${growingRegion.country} realized revenue is ${change.text} versus the prior 30 days.`,
      action: "Review the regional sales opportunity.",
      href: "/analytics",
    });
  }

  const openRfqs = await getPrisma().rfq.count({
    where: { tenantId: ctx.tenantId, status: { in: OPEN_RFQ } },
  });
  if (openRfqs > 0 && items.length < 3) {
    items.push({
      id: "rfq-pipeline",
      category: "Sales",
      insight: `${openRfqs} RFQ${openRfqs === 1 ? "" : "s"} currently open for review or quotation.`,
      action: "Prioritize open RFQs this week.",
      href: "/rfqs",
    });
  }

  return items.slice(0, 4);
}

export async function loadAnalytics(ctx: TenantContext, now = new Date()) {
  const current = trailingDays(now, 30);
  const previous = { start: addUtcDays(current.start, -30), end: current.start };

  const [totals, previousTotals, products, regions, attention, activities, series7, series30, series90, series12] =
    await Promise.all([
      periodTotals(ctx, current.start, current.end),
      periodTotals(ctx, previous.start, previous.end),
      productAggregates(ctx, current, previous),
      regionAggregates(ctx, current, previous),
      computeAttention(ctx, now),
      getPrisma().activity.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      salesBuckets(ctx, "7D", now),
      salesBuckets(ctx, "30D", now),
      salesBuckets(ctx, "90D", now),
      salesBuckets(ctx, "12M", now),
    ]);

  const opportunities = await computeOpportunities(ctx, products, regions, attention);

  return {
    current,
    previous,
    totals,
    previousTotals,
    products,
    regions,
    attention,
    opportunities,
    activities,
    series: { "7D": series7, "30D": series30, "90D": series90, "12M": series12 },
  };
}
