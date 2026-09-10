import { Prisma, PrismaClient } from "@prisma/client";

import { ensureOperationsDemoData } from "./seed-operations";
import { ensureReportingDemoData } from "./seed-reports";
import { hashPassword } from "../src/lib/server/password";

const prisma = new PrismaClient();

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function lineTotal(quantity: number, unitPrice: string): Prisma.Decimal {
  return new Prisma.Decimal(quantity).mul(money(unitPrice));
}

async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  if (existing) {
    await prisma.tenant.delete({ where: { id: existing.id } });
  }
  const isolationExisting = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  if (isolationExisting) {
    await prisma.tenant.delete({ where: { id: isolationExisting.id } });
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: "Laboratory & Allied Limited",
      slug: "lab-allied",
      status: "DEMO",
    },
  });

  const devEmail = (process.env.AUTH_DEV_EMAIL ?? "alex@laballied.demo").trim().toLowerCase();
  const devPassword = process.env.AUTH_DEV_PASSWORD;
  if (!devPassword) {
    throw new Error("AUTH_DEV_PASSWORD must be set in .env before seeding.");
  }

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: "Alex Morgan",
      email: devEmail,
      passwordHash: await hashPassword(devPassword),
      role: "MANAGER",
      status: "ACTIVE",
    },
  });

  const regionRows = [
    { name: "Kenya", country: "Kenya", code: "KE" },
    { name: "Uganda", country: "Uganda", code: "UG" },
    { name: "Tanzania", country: "Tanzania", code: "TZ" },
    { name: "Rwanda", country: "Rwanda", code: "RW" },
    { name: "Zambia", country: "Zambia", code: "ZM" },
    { name: "Malawi", country: "Malawi", code: "MW" },
  ];

  const regions = Object.fromEntries(
    await Promise.all(
      regionRows.map(async (row) => {
        const created = await prisma.region.create({ data: { ...row, tenantId: tenant.id } });
        return [row.code, created] as const;
      })
    )
  );

  const products = {
    amox: await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: "Amoxicillin 500mg",
        sku: "AMOX-500-CAP",
        category: "Antibiotic",
        description: "DEMO — capsule, 10 × 10. Matches dashboard product intelligence.",
        dosageForm: "Capsule",
        unit: "pack",
        manufacturer: "Laboratory & Allied",
        status: "ACTIVE",
      },
    }),
    ferro: await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: "Ferrous-Folic",
        sku: "FERRO-FOLIC-TAB",
        category: "Maternal health",
        description: "DEMO — tablet.",
        dosageForm: "Tablet",
        unit: "pack",
        manufacturer: "Laboratory & Allied",
        status: "ACTIVE",
      },
    }),
    azith: await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: "Azithromycin 500mg",
        sku: "AZITH-500-TAB",
        category: "Antibiotic",
        description: "DEMO — tablet, 3 × 10.",
        dosageForm: "Tablet",
        unit: "pack",
        manufacturer: "Laboratory & Allied",
        status: "ACTIVE",
      },
    }),
    para: await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: "Paracetamol 500mg",
        sku: "PARA-500-TAB",
        category: "Analgesic",
        description: "DEMO — tablet, 10 × 10.",
        dosageForm: "Tablet",
        unit: "pack",
        manufacturer: "Laboratory & Allied",
        status: "ACTIVE",
      },
    }),
    metro: await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: "Metronidazole 400mg",
        sku: "METRO-400-TAB",
        category: "Antibiotic",
        description: "DEMO — tablet.",
        dosageForm: "Tablet",
        unit: "pack",
        manufacturer: "Laboratory & Allied",
        status: "ACTIVE",
      },
    }),
  };

  const customers = {
    abc: await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: "ABC Pharmaceuticals",
        type: "WHOLESALER",
        email: "procurement@abc-pharma.demo",
        phone: "+254700000001",
        regionId: regions.KE.id,
        status: "ACTIVE",
      },
    }),
    xyz: await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: "XYZ Healthcare",
        type: "HOSPITAL",
        email: "orders@xyz-health.demo",
        phone: "+254700000002",
        regionId: regions.KE.id,
        status: "ACTIVE",
      },
    }),
    rift: await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: "Rift Valley Medical Supplies",
        type: "DISTRIBUTOR",
        email: "buying@riftvalley.demo",
        phone: "+254700000003",
        regionId: regions.KE.id,
        status: "ACTIVE",
      },
    }),
    kampala: await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: "Kampala Distributor Co.",
        type: "DISTRIBUTOR",
        email: "enquiries@kampala-dist.demo",
        phone: "+256700000004",
        regionId: regions.UG.id,
        status: "ACTIVE",
      },
    }),
    dar: await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: "Dar Medical Wholesale",
        type: "WHOLESALER",
        email: "sales@dar-med.demo",
        regionId: regions.TZ.id,
        status: "INACTIVE",
      },
    }),
    nairobi: await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: "Nairobi Community Pharmacy",
        type: "PHARMACY",
        email: "orders@nairobi-pharmacy.demo",
        regionId: regions.KE.id,
        status: "ACTIVE",
      },
    }),
  };

  const now = new Date();
  const daysAgo = (days: number, hour = 10) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - days);
    date.setUTCHours(hour, 0, 0, 0);
    return date;
  };

  async function createOrder(input: {
    customerId: string;
    status: "CONFIRMED" | "FULFILLED" | "CANCELLED";
    orderedAt: Date;
    lines: { productId: string; quantity: number; unitPrice: string }[];
  }) {
    const totals = input.lines.map((line) => lineTotal(line.quantity, line.unitPrice));
    const totalAmount = totals.reduce((sum, value) => sum.add(value), money("0"));
    return prisma.order.create({
      data: {
        tenantId: tenant.id,
        customerId: input.customerId,
        status: input.status,
        totalAmount,
        currency: "KES",
        orderedAt: input.orderedAt,
        items: {
          create: input.lines.map((line, index) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: money(line.unitPrice),
            totalAmount: totals[index],
          })),
        },
      },
    });
  }

  const orderXyz = await createOrder({
    customerId: customers.xyz.id,
    status: "CONFIRMED",
    orderedAt: daysAgo(0, 8),
    lines: [{ productId: products.amox.id, quantity: 40, unitPrice: "1850.00" }],
  });

  await createOrder({
    customerId: customers.abc.id,
    status: "FULFILLED",
    orderedAt: daysAgo(12, 11),
    lines: [
      { productId: products.amox.id, quantity: 80, unitPrice: "1850.00" },
      { productId: products.azith.id, quantity: 20, unitPrice: "2400.00" },
    ],
  });

  await createOrder({
    customerId: customers.rift.id,
    status: "FULFILLED",
    orderedAt: daysAgo(5, 14),
    lines: [{ productId: products.ferro.id, quantity: 60, unitPrice: "920.00" }],
  });

  await createOrder({
    customerId: customers.kampala.id,
    status: "CONFIRMED",
    orderedAt: daysAgo(3, 9),
    lines: [{ productId: products.amox.id, quantity: 30, unitPrice: "1850.00" }],
  });

  await createOrder({
    customerId: customers.xyz.id,
    status: "FULFILLED",
    orderedAt: daysAgo(20, 11),
    lines: [{ productId: products.para.id, quantity: 50, unitPrice: "420.00" }],
  });

  await createOrder({
    customerId: customers.rift.id,
    status: "FULFILLED",
    orderedAt: daysAgo(22, 13),
    lines: [{ productId: products.metro.id, quantity: 35, unitPrice: "610.00" }],
  });

  await createOrder({
    customerId: customers.kampala.id,
    status: "FULFILLED",
    orderedAt: daysAgo(40, 10),
    lines: [{ productId: products.amox.id, quantity: 10, unitPrice: "1850.00" }],
  });

  await createOrder({
    customerId: customers.nairobi.id,
    status: "FULFILLED",
    orderedAt: daysAgo(50, 12),
    lines: [{ productId: products.para.id, quantity: 12, unitPrice: "420.00" }],
  });

  await createOrder({
    customerId: customers.abc.id,
    status: "CANCELLED",
    orderedAt: daysAgo(2, 16),
    lines: [{ productId: products.amox.id, quantity: 500, unitPrice: "1850.00" }],
  });

  const rfqAbc = await prisma.rfq.create({
    data: {
      tenantId: tenant.id,
      customerId: customers.abc.id,
      status: "NEW",
      reference: "RFQ-10482",
      receivedAt: daysAgo(0, 7),
      dueAt: daysAgo(-2, 17),
      items: { create: [{ productId: products.amox.id, quantity: 2000 }] },
    },
  });

  await prisma.rfq.create({
    data: {
      tenantId: tenant.id,
      customerId: customers.rift.id,
      status: "IN_REVIEW",
      reference: "RFQ-10491",
      receivedAt: daysAgo(1, 15),
      items: { create: [{ productId: products.azith.id, quantity: 850 }] },
    },
  });

  await prisma.rfq.create({
    data: {
      tenantId: tenant.id,
      customerId: customers.kampala.id,
      status: "QUOTED",
      reference: "RFQ-10455",
      receivedAt: daysAgo(6, 10),
      items: { create: [{ productId: products.amox.id, quantity: 400 }] },
    },
  });

  await prisma.opportunity.createMany({
    data: [
      {
        tenantId: tenant.id,
        title: "Amoxicillin demand coverage",
        description: "DEMO — demand signal aligned with dashboard (+18% narrative). Not a live forecast.",
        type: "DEMAND",
        priority: "HIGH",
        status: "OPEN",
      },
      {
        tenantId: tenant.id,
        title: "Inactive high-value accounts",
        description: "DEMO — 3 high-value customers inactive 45+ days (dashboard attention item).",
        type: "CUSTOMER",
        priority: "HIGH",
        status: "OPEN",
      },
      {
        tenantId: tenant.id,
        title: "Quotation QT-1842 follow-up",
        description: "DEMO — overdue quotation follow-up (dashboard attention item).",
        type: "SALES",
        priority: "HIGH",
        status: "OPEN",
      },
      {
        tenantId: tenant.id,
        title: "Uganda distributor growth",
        description: "DEMO — Uganda activity growing faster than the regional average (+14.8% narrative).",
        type: "REGIONAL",
        priority: "MEDIUM",
        status: "OPEN",
      },
    ],
  });

  await prisma.activity.createMany({
    data: [
      {
        tenantId: tenant.id,
        type: "RFQ",
        title: "New RFQ received",
        description: "ABC Pharmaceuticals — RFQ-10482",
        entityType: "RFQ",
        entityId: rfqAbc.id,
        createdAt: daysAgo(0, 7),
      },
      {
        tenantId: tenant.id,
        type: "QUOTE",
        title: "Quotation accepted",
        description: "XYZ Healthcare",
        entityType: "CUSTOMER",
        entityId: customers.xyz.id,
        createdAt: daysAgo(0, 6),
      },
      {
        tenantId: tenant.id,
        type: "DOCUMENT",
        title: "Product document updated",
        description: "Amoxicillin 500mg",
        entityType: "PRODUCT",
        entityId: products.amox.id,
        createdAt: daysAgo(0, 6),
      },
      {
        tenantId: tenant.id,
        type: "ENQUIRY",
        title: "New distributor enquiry",
        description: "Uganda",
        entityType: "REGION",
        entityId: regions.UG.id,
        createdAt: daysAgo(0, 5),
      },
      {
        tenantId: tenant.id,
        type: "ORDER",
        title: "Order confirmed",
        description: "XYZ Healthcare",
        entityType: "ORDER",
        entityId: orderXyz.id,
        createdAt: daysAgo(0, 5),
      },
    ],
  });

  console.log("Seeded DEMO tenant Laboratory & Allied (slug: lab-allied).");
  console.log("Development sample only — totals come from these rows, not the Phase 4 mock figures.");

  const tenantB = await prisma.tenant.create({
    data: {
      name: "Isolation Tenant B",
      slug: "tenant-b-isolation",
      status: "ACTIVE",
    },
  });
  const regionB = await prisma.region.create({
    data: { tenantId: tenantB.id, name: "Kenya", country: "Kenya", code: "KE" },
  });
  const productB = await prisma.product.create({
    data: {
      tenantId: tenantB.id,
      name: "Ibuprofen 400mg",
      sku: "IBU-400-TAB",
      category: "Analgesic",
      description: "DEMO isolation tenant — not visible to lab-allied.",
      dosageForm: "Tablet",
      unit: "pack",
      manufacturer: "Isolation Tenant B",
      status: "ACTIVE",
    },
  });
  const customerB = await prisma.customer.create({
    data: {
      tenantId: tenantB.id,
      name: "Isolation Pharmacy B",
      type: "PHARMACY",
      email: "orders@tenant-b.demo",
      regionId: regionB.id,
      status: "ACTIVE",
    },
  });
  await prisma.order.create({
    data: {
      tenantId: tenantB.id,
      customerId: customerB.id,
      status: "FULFILLED",
      totalAmount: money("99999.00"),
      currency: "KES",
      orderedAt: daysAgo(1, 12),
      items: {
        create: [
          {
            productId: productB.id,
            quantity: 1,
            unitPrice: money("99999.00"),
            totalAmount: money("99999.00"),
          },
        ],
      },
    },
  });
  console.log("Seeded isolation tenant tenant-b-isolation.");

  const emptyExisting = await prisma.tenant.findUnique({ where: { slug: "tenant-c-empty" } });
  if (emptyExisting) await prisma.tenant.delete({ where: { id: emptyExisting.id } });
  await prisma.tenant.create({
    data: { name: "Empty Workspace", slug: "tenant-c-empty", status: "ACTIVE" },
  });
  console.log("Seeded empty tenant tenant-c-empty.");
  await ensureOperationsDemoData(prisma);
  await ensureReportingDemoData(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
