import { Prisma, type PrismaClient } from "@prisma/client";

import { DEMO_ISOLATION_SLUG, LEGACY_ISOLATION_SLUG } from "./verify-tenants";

function utcDay(offset: number, hour = 10): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, hour, 0, 0));
}

/**
 * Additive demo fixtures required by `npm run db:verify`.
 * Only mutates tenants with status DEMO. Never wipes data.
 */
export async function ensureVerifyPrerequisites(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant || tenant.status !== "DEMO") {
    throw new Error("ensureVerifyPrerequisites requires medicrest tenant with status DEMO.");
  }

  const extraRegions = [
    { name: "Uganda", country: "Uganda", code: "UG" },
    { name: "Tanzania", country: "Tanzania", code: "TZ" },
    { name: "Rwanda", country: "Rwanda", code: "RW" },
    { name: "Ethiopia", country: "Ethiopia", code: "ET" },
    { name: "Ghana", country: "Ghana", code: "GH" },
  ];
  for (const row of extraRegions) {
    const exists = await prisma.region.findFirst({ where: { tenantId: tenant.id, code: row.code } });
    if (!exists) {
      await prisma.region.create({ data: { ...row, tenantId: tenant.id } });
    }
  }

  const keRegion = await prisma.region.findFirst({ where: { tenantId: tenant.id, code: "KE" } });
  if (!keRegion) throw new Error("medicrest missing Kenya region");

  const extraCustomers = [
    { name: "MedSupply Kenya", type: "WHOLESALER" as const, email: "orders@medsupply.demo" },
    { name: "Coastal Distributors", type: "DISTRIBUTOR" as const, email: "buyers@coastal.demo" },
  ];
  for (const row of extraCustomers) {
    const exists = await prisma.customer.findFirst({
      where: { tenantId: tenant.id, name: row.name },
    });
    if (!exists) {
      await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          name: row.name,
          type: row.type,
          email: row.email,
          phone: "+254700000099",
          regionId: keRegion.id,
          status: "ACTIVE",
        },
      });
    }
  }

  const abc = await prisma.customer.findFirst({
    where: { tenantId: tenant.id, name: { equals: "ABC Pharmaceuticals", mode: "insensitive" } },
  });
  const amox = await prisma.product.findUnique({
    where: { tenantId_sku: { tenantId: tenant.id, sku: "AMOX-500-CAP" } },
  });
  if (abc && amox) {
    const rfq = await prisma.rfq.findFirst({ where: { tenantId: tenant.id, reference: "RFQ-10482" } });
    if (!rfq) {
      await prisma.rfq.create({
        data: {
          tenantId: tenant.id,
          customerId: abc.id,
          status: "IN_REVIEW",
          reference: "RFQ-10482",
          receivedAt: utcDay(-3),
          dueAt: utcDay(14),
          items: { create: [{ productId: amox.id, quantity: 2000 }] },
        },
      });
    } else {
      const item = await prisma.rfqItem.findFirst({ where: { rfqId: rfq.id, productId: amox.id } });
      if (item && item.quantity !== 2000) {
        await prisma.rfqItem.update({ where: { id: item.id }, data: { quantity: 2000 } });
      }
    }
  }

  const orderCount = await prisma.order.count({ where: { tenantId: tenant.id } });
  if (orderCount === 0 && abc && amox) {
    await prisma.order.create({
      data: {
        tenantId: tenant.id,
        customerId: abc.id,
        status: "CONFIRMED",
        totalAmount: new Prisma.Decimal("423000.00"),
        currency: "KES",
        orderedAt: utcDay(-8),
        items: {
          create: [
            {
              productId: amox.id,
              quantity: 1000,
              unitPrice: new Prisma.Decimal("423.00"),
              totalAmount: new Prisma.Decimal("423000.00"),
            },
          ],
        },
      },
    });
    await prisma.order.create({
      data: {
        tenantId: tenant.id,
        customerId: abc.id,
        status: "CANCELLED",
        totalAmount: new Prisma.Decimal("50000.00"),
        currency: "KES",
        orderedAt: utcDay(-20),
        items: {
          create: [
            {
              productId: amox.id,
              quantity: 100,
              unitPrice: new Prisma.Decimal("500.00"),
              totalAmount: new Prisma.Decimal("50000.00"),
            },
          ],
        },
      },
    });
  } else {
    const cancelled = await prisma.order.findFirst({
      where: { tenantId: tenant.id, status: "CANCELLED" },
    });
    if (!cancelled && abc && amox) {
      await prisma.order.create({
        data: {
          tenantId: tenant.id,
          customerId: abc.id,
          status: "CANCELLED",
          totalAmount: new Prisma.Decimal("50000.00"),
          currency: "KES",
          orderedAt: utcDay(-20),
          items: {
            create: [
              {
                productId: amox.id,
                quantity: 100,
                unitPrice: new Prisma.Decimal("500.00"),
                totalAmount: new Prisma.Decimal("50000.00"),
              },
            ],
          },
        },
      });
    }
  }

  if ((await prisma.opportunity.count({ where: { tenantId: tenant.id } })) === 0) {
    await prisma.opportunity.create({
      data: {
        tenantId: tenant.id,
        title: "Amoxicillin tender follow-up",
        description: "Demo opportunity for verification.",
        type: "SALES",
        priority: "HIGH",
        status: "OPEN",
      },
    });
  }

  if ((await prisma.activity.count({ where: { tenantId: tenant.id } })) === 0 && abc) {
    await prisma.activity.create({
      data: {
        tenantId: tenant.id,
        type: "NOTE",
        title: "Verification fixture activity",
        description: "Demo activity for db:verify prerequisites.",
        entityType: "CUSTOMER",
        entityId: abc.id,
      },
    });
  }

  const legacyB = await prisma.tenant.findUnique({ where: { slug: LEGACY_ISOLATION_SLUG } });
  let tenantB =
    legacyB?.status === "DEMO"
      ? legacyB
      : legacyB
        ? await prisma.tenant.upsert({
            where: { slug: DEMO_ISOLATION_SLUG },
            create: {
              name: "Isolation Pharma B (verify)",
              slug: DEMO_ISOLATION_SLUG,
              status: "DEMO",
            },
            update: {},
          })
        : await prisma.tenant.create({
            data: {
              name: "Isolation Pharma B",
              slug: LEGACY_ISOLATION_SLUG,
              status: "DEMO",
            },
          });

  if (legacyB && legacyB.status !== "DEMO") {
    console.warn(
      `Isolation fixtures use ${DEMO_ISOLATION_SLUG} (${LEGACY_ISOLATION_SLUG} is ${legacyB.status}, not modified).`
    );
  }

  const bRegion =
    (await prisma.region.findFirst({ where: { tenantId: tenantB.id } })) ??
    (await prisma.region.create({
      data: { tenantId: tenantB.id, name: "Kenya", country: "Kenya", code: "KE-B" },
    }));

  let customerB = await prisma.customer.findFirst({
    where: { tenantId: tenantB.id, name: "Isolation Pharmacy B" },
  });
  if (!customerB) {
    customerB = await prisma.customer.create({
      data: {
        tenantId: tenantB.id,
        name: "Isolation Pharmacy B",
        type: "PHARMACY",
        email: "isolation@tenant-b.demo",
        phone: "+254711111111",
        regionId: bRegion.id,
        status: "ACTIVE",
      },
    });
  }

  let ibu = await prisma.product.findFirst({
    where: { tenantId: tenantB.id, sku: "IBU-400-TAB" },
  });
  if (!ibu) {
    ibu = await prisma.product.create({
      data: {
        tenantId: tenantB.id,
        sku: "IBU-400-TAB",
        name: "Ibuprofen 400mg",
        category: "Analgesic",
        description: "Isolation tenant product.",
        dosageForm: "Tablet",
        unit: "pack",
        manufacturer: "Isolation Pharma B",
        status: "ACTIVE",
        safetyStock: 500,
      },
    });
  }

  const bOrders = await prisma.order.count({ where: { tenantId: tenantB.id } });
  if (bOrders === 0) {
    await prisma.order.create({
      data: {
        tenantId: tenantB.id,
        customerId: customerB.id,
        status: "CONFIRMED",
        totalAmount: new Prisma.Decimal("100000.00"),
        currency: "KES",
        orderedAt: utcDay(-5),
        items: {
          create: [
            {
              productId: ibu.id,
              quantity: 500,
              unitPrice: new Prisma.Decimal("200.00"),
              totalAmount: new Prisma.Decimal("100000.00"),
            },
          ],
        },
      },
    });
  }

  const { ensureOperationsDemoData } = await import("./seed-operations");
  await ensureOperationsDemoData(prisma);

  const { ensureGanttSkyPlannerDemoSeed } = await import("./seed-gantt-demo");
  await ensureGanttSkyPlannerDemoSeed(prisma);

  const { ensureReportingDemoData } = await import("./seed-reports");
  await ensureReportingDemoData(prisma);

  let emptyTenant = await prisma.tenant.findUnique({ where: { slug: "tenant-c-empty" } });
  if (!emptyTenant) {
    emptyTenant = await prisma.tenant.create({
      data: { name: "Empty verification tenant", slug: "tenant-c-empty", status: "DEMO" },
    });
  }

  console.log("Verification prerequisites ensured (DEMO tenants only).");
}
