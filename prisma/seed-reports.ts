import { Prisma, type InventoryClass, type PrismaClient } from "@prisma/client";

function utcDay(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, 8, 0, 0));
}

async function ensureProduct(
  prisma: PrismaClient,
  tenantId: string,
  sku: string,
  data: { name: string; category: string; unit: string; safetyStock: number; description: string }
) {
  const existing = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId, sku } } });
  if (existing) {
    if (existing.safetyStock !== data.safetyStock) {
      return prisma.product.update({ where: { id: existing.id }, data: { safetyStock: data.safetyStock } });
    }
    return existing;
  }
  return prisma.product.create({
    data: {
      tenantId,
      sku,
      name: data.name,
      category: data.category,
      description: data.description,
      unit: data.unit,
      manufacturer: "MediCrest Pharmaceuticals",
      status: "ACTIVE",
      safetyStock: data.safetyStock,
    },
  });
}

export async function ensureReportingDemoData(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) return;

  const warehouseCount = await prisma.warehouse.count({ where: { tenantId: tenant.id } });
  if (warehouseCount === 0) {
    const fg = await prisma.warehouse.create({
      data: { tenantId: tenant.id, name: "Nairobi finished goods", code: "NRB-FG" },
    });
    const rm = await prisma.warehouse.create({
      data: { tenantId: tenant.id, name: "Raw material store", code: "NRB-RM" },
    });
    const pkg = await prisma.warehouse.create({
      data: { tenantId: tenant.id, name: "Packaging store", code: "NRB-PK" },
    });

    const amox = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId: tenant.id, sku: "AMOX-500-CAP" } } });
    const para = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId: tenant.id, sku: "PARA-500-TAB" } } });
    const ferro = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId: tenant.id, sku: "FERRO-FOLIC-TAB" } } });
    const azith = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId: tenant.id, sku: "AZITH-500-TAB" } } });
    if (!amox || !para || !ferro || !azith) return;

    await prisma.product.update({ where: { id: amox.id }, data: { safetyStock: 20000 } });
    await prisma.product.update({ where: { id: para.id }, data: { safetyStock: 15000 } });
    await prisma.product.update({ where: { id: ferro.id }, data: { safetyStock: 8000 } });
    await prisma.product.update({ where: { id: azith.id }, data: { safetyStock: 5000 } });

    const api = await ensureProduct(prisma, tenant.id, "AMOX-API-KG", {
      name: "Amoxicillin API",
      category: "Raw material",
      unit: "kg",
      safetyStock: 400,
      description: "DEMO reporting material — not a clinical claim.",
    });
    const blister = await ensureProduct(prisma, tenant.id, "BLISTER-ALU-ALU", {
      name: "Alu/Alu blister film",
      category: "Packaging",
      unit: "roll",
      safetyStock: 80,
      description: "DEMO reporting packaging — not a clinical claim.",
    });
    const labels = await ensureProduct(prisma, tenant.id, "LABEL-STD-PACK", {
      name: "Standard pack labels",
      category: "Packaging",
      unit: "pack",
      safetyStock: 120,
      description: "DEMO reporting packaging — not a clinical claim.",
    });

    const lots: Array<{
      productId: string;
      warehouseId: string;
      class: InventoryClass;
      batchCode: string;
      quantity: number;
      unitValue: string;
      receivedOffset: number;
      expiryOffset: number | null;
    }> = [
      { productId: amox.id, warehouseId: fg.id, class: "FINISHED_GOOD", batchCode: "FG-AMOX-EXP", quantity: 18500, unitValue: "420.00", receivedOffset: -400, expiryOffset: -12 },
      { productId: para.id, warehouseId: fg.id, class: "FINISHED_GOOD", batchCode: "FG-PARA-EXP", quantity: 6200, unitValue: "95.00", receivedOffset: -380, expiryOffset: -4 },
      { productId: amox.id, warehouseId: fg.id, class: "FINISHED_GOOD", batchCode: "FG-AMOX-30", quantity: 24000, unitValue: "420.00", receivedOffset: -200, expiryOffset: 18 },
      { productId: ferro.id, warehouseId: fg.id, class: "FINISHED_GOOD", batchCode: "FG-FERRO-45", quantity: 4100, unitValue: "160.00", receivedOffset: -90, expiryOffset: 45 },
      { productId: azith.id, warehouseId: fg.id, class: "FINISHED_GOOD", batchCode: "FG-AZITH-75", quantity: 2800, unitValue: "510.00", receivedOffset: -70, expiryOffset: 75 },
      { productId: para.id, warehouseId: fg.id, class: "FINISHED_GOOD", batchCode: "FG-PARA-110", quantity: 9600, unitValue: "95.00", receivedOffset: -130, expiryOffset: 110 },
      { productId: amox.id, warehouseId: fg.id, class: "FINISHED_GOOD", batchCode: "FG-AMOX-165", quantity: 7200, unitValue: "420.00", receivedOffset: -170, expiryOffset: 165 },
      { productId: ferro.id, warehouseId: fg.id, class: "FINISHED_GOOD", batchCode: "FG-FERRO-250", quantity: 1500, unitValue: "160.00", receivedOffset: -40, expiryOffset: 250 },
      { productId: para.id, warehouseId: fg.id, class: "FINISHED_GOOD", batchCode: "FG-PARA-400", quantity: 31000, unitValue: "95.00", receivedOffset: -20, expiryOffset: 400 },
      { productId: amox.id, warehouseId: fg.id, class: "FINISHED_GOOD", batchCode: "FG-AMOX-OLD", quantity: 54000, unitValue: "420.00", receivedOffset: -410, expiryOffset: 200 },
      { productId: api.id, warehouseId: rm.id, class: "RAW_MATERIAL", batchCode: "RM-API-LOW", quantity: 90, unitValue: "18500.00", receivedOffset: -60, expiryOffset: 22 },
      { productId: api.id, warehouseId: rm.id, class: "RAW_MATERIAL", batchCode: "RM-API-OK", quantity: 210, unitValue: "18500.00", receivedOffset: -25, expiryOffset: 140 },
      { productId: blister.id, warehouseId: pkg.id, class: "PACKAGING", batchCode: "PK-BLIST-SHORT", quantity: 18, unitValue: "2400.00", receivedOffset: -200, expiryOffset: null },
      { productId: labels.id, warehouseId: pkg.id, class: "PACKAGING", batchCode: "PK-LABEL-EXC", quantity: 640, unitValue: "35.00", receivedOffset: -15, expiryOffset: 80 },
    ];

    await prisma.inventoryLot.createMany({
      data: lots.map((lot) => ({
        tenantId: tenant.id,
        productId: lot.productId,
        warehouseId: lot.warehouseId,
        class: lot.class,
        batchCode: lot.batchCode,
        quantity: lot.quantity,
        unitValue: new Prisma.Decimal(lot.unitValue),
        receivedAt: utcDay(lot.receivedOffset),
        expiryDate: lot.expiryOffset === null ? null : utcDay(lot.expiryOffset),
      })),
    });
  }

  await ensureReportingDepth(prisma);

  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  if (!tenantB) return;
  if ((await prisma.warehouse.count({ where: { tenantId: tenantB.id } })) > 0) return;
  const productB = await prisma.product.findFirst({ where: { tenantId: tenantB.id } });
  if (!productB) return;
  const warehouseB = await prisma.warehouse.create({
    data: { tenantId: tenantB.id, name: "Isolation warehouse", code: "ISO-WH" },
  });
  await prisma.product.update({ where: { id: productB.id }, data: { safetyStock: 50 } });
  await prisma.inventoryLot.create({
    data: {
      tenantId: tenantB.id,
      productId: productB.id,
      warehouseId: warehouseB.id,
      class: "FINISHED_GOOD",
      batchCode: "ISO-LOT-1",
      quantity: 75,
      unitValue: new Prisma.Decimal("80.00"),
      receivedAt: utcDay(-10),
      expiryDate: utcDay(40),
    },
  });
}

async function ensureSupplier(prisma: PrismaClient, tenantId: string, code: string, name: string) {
  const existing = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "Supplier" WHERE "tenantId" = ${tenantId} AND code = ${code} LIMIT 1`
  );
  if (existing[0]) return existing[0];
  const id = crypto.randomUUID();
  await prisma.$executeRaw(
    Prisma.sql`INSERT INTO "Supplier" (id, "tenantId", name, code, "createdAt", "updatedAt") VALUES (${id}, ${tenantId}, ${name}, ${code}, NOW(), NOW())`
  );
  return { id };
}

async function ensureReportingDepth(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) return;
  const tenantId = tenant.id;

  const apiSupplier = await ensureSupplier(prisma, tenantId, "SUP-API", "Kenya Pharma Inputs");
  const packSupplier = await ensureSupplier(prisma, tenant.id, "SUP-PKG", "Eastpack Limited");

  const lots = await prisma.$queryRaw<
    Array<{ id: string; class: InventoryClass; productId: string; quantity: number; unitValue: Prisma.Decimal }>
  >(Prisma.sql`SELECT id, class, "productId", quantity, "unitValue" FROM "InventoryLot" WHERE "tenantId" = ${tenant.id}`);

  for (const lot of lots) {
    const supplierId = lot.class === "RAW_MATERIAL" ? apiSupplier.id : lot.class === "PACKAGING" ? packSupplier.id : null;
    await prisma.$executeRaw(Prisma.sql`UPDATE "InventoryLot" SET "supplierId" = ${supplierId} WHERE id = ${lot.id}`);
  }

  const api = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId: tenant.id, sku: "AMOX-API-KG" } } });
  const blister = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId: tenant.id, sku: "BLISTER-ALU-ALU" } } });
  const labels = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId: tenant.id, sku: "LABEL-STD-PACK" } } });
  const amox = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId: tenant.id, sku: "AMOX-500-CAP" } } });
  const rm = await prisma.warehouse.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code: "NRB-RM" } } });
  const pkg = await prisma.warehouse.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code: "NRB-PK" } } });

  async function ensureReceipt(reference: string, productId: string, warehouseId: string, supplierId: string, quantity: number, expectedAt: Date) {
    const found = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM "InventoryReceipt" WHERE "tenantId" = ${tenantId} AND reference = ${reference} LIMIT 1`
    );
    if (found[0]) {
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "InventoryReceipt" SET quantity = ${quantity}, status = 'OPEN', "updatedAt" = NOW() WHERE id = ${found[0].id}`
      );
      return;
    }
    const id = crypto.randomUUID();
    await prisma.$executeRaw(
      Prisma.sql`INSERT INTO "InventoryReceipt" (id, "tenantId", "productId", "warehouseId", "supplierId", reference, quantity, status, "expectedAt", "createdAt", "updatedAt") VALUES (${id}, ${tenantId}, ${productId}, ${warehouseId}, ${supplierId}, ${reference}, ${quantity}, 'OPEN', ${expectedAt}, NOW(), NOW())`
    );
  }

  if (api && rm) await ensureReceipt("PO-RM-221", api.id, rm.id, apiSupplier.id, 200, utcDay(14));
  if (blister && pkg) await ensureReceipt("PO-PK-88", blister.id, pkg.id, packSupplier.id, 40, utcDay(7));

  if (amox && api && blister && labels) {
    const lines: Array<{ componentId: string; quantityPer: string }> = [
      { componentId: api.id, quantityPer: "0.010000" },
      { componentId: blister.id, quantityPer: "0.002000" },
      { componentId: labels.id, quantityPer: "0.010000" },
    ];
    for (const line of lines) {
      const found = await prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "BillOfMaterial" WHERE "tenantId" = ${tenant.id} AND "productId" = ${amox.id} AND "componentId" = ${line.componentId} LIMIT 1`
      );
      if (found[0]) {
        await prisma.$executeRaw(
          Prisma.sql`UPDATE "BillOfMaterial" SET "quantityPer" = ${line.quantityPer}::decimal WHERE id = ${found[0].id}`
        );
      } else {
        const id = crypto.randomUUID();
        await prisma.$executeRaw(
          Prisma.sql`INSERT INTO "BillOfMaterial" (id, "tenantId", "productId", "componentId", "quantityPer") VALUES (${id}, ${tenant.id}, ${amox.id}, ${line.componentId}, ${line.quantityPer}::decimal)`
        );
      }
    }
  }

  const existingSnapshots = await prisma.$queryRaw<Array<{ n: bigint }>>(
    Prisma.sql`SELECT COUNT(*)::bigint AS n FROM "InventorySnapshot" WHERE "tenantId" = ${tenant.id}`
  );
  if (Number(existingSnapshots[0]?.n ?? 0) > 0) return;

  const grouped = new Map<string, { productId: string; class: InventoryClass; quantity: number; value: Prisma.Decimal }>();
  for (const lot of lots) {
    const current = grouped.get(lot.productId) ?? {
      productId: lot.productId,
      class: lot.class,
      quantity: 0,
      value: new Prisma.Decimal(0),
    };
    current.quantity += lot.quantity;
    current.value = current.value.add(asMoney(lot.unitValue).mul(lot.quantity));
    grouped.set(lot.productId, current);
  }

  for (let week = 7; week >= 0; week--) {
    const factor = 0.75 + (0.25 * (7 - week)) / 7;
    const capturedOn = utcDay(-week * 7);
    for (const row of grouped.values()) {
      const quantity = Math.max(0, Math.round(row.quantity * factor));
      const value = row.value.mul(factor).toDecimalPlaces(2).toString();
      const id = crypto.randomUUID();
      await prisma.$executeRaw(
        Prisma.sql`INSERT INTO "InventorySnapshot" (id, "tenantId", "productId", class, "capturedOn", quantity, value) VALUES (${id}, ${tenant.id}, ${row.productId}, ${row.class}::"InventoryClass", ${capturedOn}::date, ${quantity}, ${value}::decimal)`
      );
    }
  }
}

function asMoney(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(String(value));
}
