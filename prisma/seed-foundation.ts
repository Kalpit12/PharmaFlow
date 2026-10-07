import { Prisma, type PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/server/password";

import {
  DEMO_DEV_EMAIL_DEFAULT,
  DEMO_TENANT_LEGAL_NAME,
  DEMO_TENANT_SLUG,
  LEGACY_DEMO_TENANT_SLUG,
} from "./demo-tenant";
import { wipeTenantForReseed } from "./wipe-tenant";

function utcDay(offset: number, hour = 8): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, hour, 0, 0));
}

/** Demo tenant master data only — no sales, plans, batches, or quality narratives. */
export async function seedDemoTenantFoundation(prisma: PrismaClient) {
  const existing = await prisma.tenant.findUnique({ where: { slug: DEMO_TENANT_SLUG } });
  if (existing) {
    await wipeTenantForReseed(prisma, existing.id);
  }
  const legacy = await prisma.tenant.findUnique({ where: { slug: LEGACY_DEMO_TENANT_SLUG } });
  if (legacy) {
    await wipeTenantForReseed(prisma, legacy.id);
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: DEMO_TENANT_LEGAL_NAME,
      slug: DEMO_TENANT_SLUG,
      status: "DEMO",
    },
  });

  const devEmail = (process.env.AUTH_DEV_EMAIL ?? DEMO_DEV_EMAIL_DEFAULT).trim().toLowerCase();
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

  const regionRows = [{ name: "Kenya", country: "Kenya", code: "KE" }];
  const regions: Record<string, { id: string }> = {};
  for (const row of regionRows) {
    const created = await prisma.region.create({ data: { ...row, tenantId: tenant.id } });
    regions[row.code] = created;
  }

  await prisma.customer.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: "ABC Pharmaceuticals",
        type: "WHOLESALER",
        email: "procurement@abc-pharma.demo",
        phone: "+254700000001",
        regionId: regions.KE.id,
        status: "ACTIVE",
      },
      {
        tenantId: tenant.id,
        name: "XYZ Healthcare",
        type: "HOSPITAL",
        email: "orders@xyz-health.demo",
        phone: "+254700000002",
        regionId: regions.KE.id,
        status: "ACTIVE",
      },
    ],
  });

  const fgSkus = [
    {
      sku: "AMOX-500-CAP",
      name: "Amoxicillin 500mg",
      category: "Antibiotic",
      dosageForm: "Capsule",
      unit: "pack",
      safetyStock: 20000,
      description: "Capsule, 10 × 10 packs.",
    },
    {
      sku: "PARA-500-TAB",
      name: "Paracetamol 500mg",
      category: "Analgesic",
      dosageForm: "Tablet",
      unit: "pack",
      safetyStock: 15000,
      description: "Tablet, 10 × 10 packs.",
    },
    {
      sku: "FERRO-FOLIC-TAB",
      name: "Ferrous-Folic",
      category: "Maternal health",
      dosageForm: "Tablet",
      unit: "pack",
      safetyStock: 8000,
      description: "Iron + folic tablet packs.",
    },
    {
      sku: "AZITH-500-TAB",
      name: "Azithromycin 500mg",
      category: "Antibiotic",
      dosageForm: "Tablet",
      unit: "pack",
      safetyStock: 5000,
      description: "Tablet, 3 × 10 packs.",
    },
    {
      sku: "COUGH-SYR-100",
      name: "Cough Syrup 100ml",
      category: "Cough and cold",
      dosageForm: "Syrup",
      unit: "bottle",
      safetyStock: 3000,
      description: "100 ml amber bottle.",
    },
  ] as const;

  const products: Record<string, { id: string }> = {};
  for (const row of fgSkus) {
    const created = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        sku: row.sku,
        name: row.name,
        category: row.category,
        description: row.description,
        dosageForm: row.dosageForm,
        unit: row.unit,
        manufacturer: "MediCrest Pharmaceuticals",
        status: "ACTIVE",
        safetyStock: row.safetyStock,
      },
    });
    products[row.sku] = created;
  }

  const rmSkus = [
    {
      sku: "AMOX-API-KG",
      name: "Amoxicillin API",
      category: "Raw material",
      unit: "kg",
      safetyStock: 400,
      description: "Active ingredient for amoxicillin capsules.",
    },
    {
      sku: "BLISTER-ALU-ALU",
      name: "Alu/Alu blister film",
      category: "Packaging",
      unit: "roll",
      safetyStock: 80,
      description: "Blister packaging roll.",
    },
    {
      sku: "LABEL-STD-PACK",
      name: "Standard pack labels",
      category: "Packaging",
      unit: "pack",
      safetyStock: 120,
      description: "Carton and blister labels.",
    },
  ] as const;

  for (const row of rmSkus) {
    const created = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        sku: row.sku,
        name: row.name,
        category: row.category,
        description: row.description,
        unit: row.unit,
        manufacturer: "MediCrest Pharmaceuticals",
        status: "ACTIVE",
        safetyStock: row.safetyStock,
      },
    });
    products[row.sku] = created;
  }

  const lineData = [
    { name: "Tablet Line A", code: "TLA", capacityHoursPerDay: 8, active: true },
    { name: "Tablet Line B", code: "TLB", capacityHoursPerDay: 8, active: true },
    { name: "Capsule Line A", code: "CLA", capacityHoursPerDay: 8, active: true },
    { name: "Liquid Line A", code: "LLA", capacityHoursPerDay: 8, active: true },
    { name: "Packaging Line A", code: "PLA", capacityHoursPerDay: 8, active: true },
    { name: "Packaging Line B", code: "PLB", capacityHoursPerDay: 8, active: true },
  ];
  for (const data of lineData) {
    await prisma.workstation.create({ data: { ...data, tenantId: tenant.id } });
  }

  const fg = await prisma.warehouse.create({
    data: { tenantId: tenant.id, name: "Nairobi finished goods", code: "NRB-FG" },
  });
  const rm = await prisma.warehouse.create({
    data: { tenantId: tenant.id, name: "Raw material store", code: "NRB-RM" },
  });
  const pkg = await prisma.warehouse.create({
    data: { tenantId: tenant.id, name: "Packaging store", code: "NRB-PK" },
  });

  const amox = products["AMOX-500-CAP"];
  const para = products["PARA-500-TAB"];
  const api = products["AMOX-API-KG"];
  const blister = products["BLISTER-ALU-ALU"];
  const labels = products["LABEL-STD-PACK"];

  await prisma.inventoryLot.createMany({
    data: [
      {
        tenantId: tenant.id,
        productId: amox.id,
        warehouseId: fg.id,
        class: "FINISHED_GOOD",
        batchCode: "FG-AMOX-OPEN",
        quantity: 8200,
        unitValue: new Prisma.Decimal("420.00"),
        receivedAt: utcDay(-45),
        expiryDate: utcDay(120),
      },
      {
        tenantId: tenant.id,
        productId: para.id,
        warehouseId: fg.id,
        class: "FINISHED_GOOD",
        batchCode: "FG-PARA-OPEN",
        quantity: 11200,
        unitValue: new Prisma.Decimal("95.00"),
        receivedAt: utcDay(-30),
        expiryDate: utcDay(200),
      },
      {
        tenantId: tenant.id,
        productId: api.id,
        warehouseId: rm.id,
        class: "RAW_MATERIAL",
        batchCode: "RM-API-041",
        quantity: 185,
        unitValue: new Prisma.Decimal("18500.00"),
        receivedAt: utcDay(-20),
        expiryDate: utcDay(90),
      },
      {
        tenantId: tenant.id,
        productId: blister.id,
        warehouseId: pkg.id,
        class: "PACKAGING",
        batchCode: "PK-BLIST-12",
        quantity: 42,
        unitValue: new Prisma.Decimal("2400.00"),
        receivedAt: utcDay(-60),
        expiryDate: null,
      },
      {
        tenantId: tenant.id,
        productId: labels.id,
        warehouseId: pkg.id,
        class: "PACKAGING",
        batchCode: "PK-LBL-08",
        quantity: 280,
        unitValue: new Prisma.Decimal("35.00"),
        receivedAt: utcDay(-14),
        expiryDate: utcDay(365),
      },
    ],
  });

  const apiSupplier = (
    await prisma.supplier.create({
      data: { tenantId: tenant.id, name: "Kenya Pharma Inputs Ltd", code: "SUP-API", status: "ACTIVE" },
    })
  ).id;
  const packSupplier = (
    await prisma.supplier.create({
      data: { tenantId: tenant.id, name: "Eastpack Limited", code: "SUP-PKG", status: "ACTIVE" },
    })
  ).id;

  await prisma.$executeRaw(
    Prisma.sql`UPDATE "InventoryLot" SET "supplierId" = ${apiSupplier} WHERE "tenantId" = ${tenant.id} AND class = 'RAW_MATERIAL'`
  );
  await prisma.$executeRaw(
    Prisma.sql`UPDATE "InventoryLot" SET "supplierId" = ${packSupplier} WHERE "tenantId" = ${tenant.id} AND class = 'PACKAGING'`
  );

  for (const line of [
    { componentId: api.id, quantityPer: "0.010000" },
    { componentId: blister.id, quantityPer: "0.002000" },
    { componentId: labels.id, quantityPer: "0.010000" },
  ]) {
    const id = crypto.randomUUID();
    await prisma.$executeRaw(
      Prisma.sql`INSERT INTO "BillOfMaterial" (id, "tenantId", "productId", "componentId", "quantityPer") VALUES (${id}, ${tenant.id}, ${amox.id}, ${line.componentId}, ${line.quantityPer}::decimal)`
    );
  }

  await prisma.supplierMaterial.create({
    data: {
      tenantId: tenant.id,
      supplierId: apiSupplier,
      productId: api.id,
      isPreferred: true,
      leadTimeDays: 14,
      unitPrice: new Prisma.Decimal("18200.00"),
      currency: "KES",
    },
  });
  await prisma.supplierMaterial.create({
    data: {
      tenantId: tenant.id,
      supplierId: packSupplier,
      productId: blister.id,
      isPreferred: true,
      leadTimeDays: 7,
      unitPrice: new Prisma.Decimal("2350.00"),
      currency: "KES",
    },
  });

  console.log("Seeded MediCrest foundation (master data only, slug: medicrest).");
}
