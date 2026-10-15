import type { PrismaClient } from "@prisma/client";

import { getIsolationTenant } from "./verify-tenants";

/** Phase 2 — validated batch sizes on demo SKUs (idempotent). */
export async function ensureOperationsPhase2DemoData(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) return;

  const batchBySku: Record<string, number> = {
    "AMOX-500-CAP": 12000,
    "PARA-500-TAB": 8000,
    "FERRO-FOLIC-TAB": 6000,
    "AZITH-500-TAB": 10000,
    "COUGH-SYR-100": 2000,
  };

  for (const [sku, validatedBatchSize] of Object.entries(batchBySku)) {
    await prisma.product.updateMany({
      where: { tenantId: tenant.id, sku },
      data: { validatedBatchSize },
    });
  }

  const prospectExists = await prisma.productionOrder.findFirst({
    where: { tenantId: tenant.id, orderNumber: { startsWith: "PRP-" } },
    select: { id: true },
  });
  if (prospectExists) return;

  const amox = await prisma.product.findFirst({
    where: { tenantId: tenant.id, sku: "AMOX-500-CAP" },
    select: { id: true, validatedBatchSize: true },
  });
  if (!amox) return;

  const year = new Date().getUTCFullYear();
  await prisma.productionOrder.create({
    data: {
      tenantId: tenant.id,
      orderNumber: `PRP-${year}-001`,
      productId: amox.id,
      quantity: 15000,
      priority: "HIGH",
      status: "UNSCHEDULED",
      orderKind: "PROSPECT",
      scheduleDirection: "JIT",
      dueDate: utcDay(14, 16),
      durationMinutes: 480,
      validatedBatchSize: amox.validatedBatchSize,
      wholeBatchCount: 2,
      partialBatchRemainder: 3000,
      reserveCapacity: true,
      isLocked: false,
    },
  });
}
function utcDay(offset: number, hour = 8): Date {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, hour, 0, 0));
  return start;
}

export async function ensureOperationsDemoData(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) return;

  const existing = await prisma.workstation.count({ where: { tenantId: tenant.id } });
  if (existing === 0) {
    let cough = await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: "COUGH-SYR-100" } });
    if (!cough) {
      cough = await prisma.product.create({
        data: {
          tenantId: tenant.id,
          name: "Cough Syrup",
          sku: "COUGH-SYR-100",
          category: "Cough and cold",
          description: "DEMO planner product — not a clinical claim.",
          dosageForm: "Syrup",
          unit: "bottle",
          manufacturer: "MediCrest Pharmaceuticals",
          status: "ACTIVE",
        },
      });
    }

    const products = {
      amox: await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: "AMOX-500-CAP" } }),
      ferro: await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: "FERRO-FOLIC-TAB" } }),
      para: await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: "PARA-500-TAB" } }),
      azith: await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: "AZITH-500-TAB" } }),
      cough,
    };
    if (!products.amox || !products.ferro || !products.para || !products.azith) return;

    const lineData = [
      { tenantId: tenant.id, name: "Tablet Line A", code: "TLA", capacityHoursPerDay: 8, active: true },
      { tenantId: tenant.id, name: "Tablet Line B", code: "TLB", capacityHoursPerDay: 8, active: true },
      { tenantId: tenant.id, name: "Capsule Line A", code: "CLA", capacityHoursPerDay: 8, active: true },
      { tenantId: tenant.id, name: "Liquid Line A", code: "LLA", capacityHoursPerDay: 8, active: true },
      { tenantId: tenant.id, name: "Packaging Line A", code: "PLA", capacityHoursPerDay: 8, active: true },
      { tenantId: tenant.id, name: "Packaging Line B", code: "PLB", capacityHoursPerDay: 8, active: true },
    ];
    const lines = [];
    for (const data of lineData) {
      lines.push(await prisma.workstation.create({ data }));
    }
    const byCode = Object.fromEntries(lines.map((row) => [row.code, row]));

    await prisma.productionOrder.createMany({
      data: [
        {
          tenantId: tenant.id,
          orderNumber: "PO-104",
          productId: products.amox.id,
          workstationId: byCode.CLA.id,
          quantity: 12000,
          priority: "CRITICAL",
          status: "SCHEDULED",
          dueDate: utcDay(3, 16),
          plannedStart: utcDay(0, 8),
          plannedEnd: utcDay(1, 16),
          durationMinutes: 960,
          isLocked: true,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-105",
          productId: products.para.id,
          workstationId: byCode.TLA.id,
          quantity: 8000,
          priority: "HIGH",
          status: "SCHEDULED",
          dueDate: utcDay(4, 16),
          plannedStart: utcDay(1, 8),
          plannedEnd: utcDay(2, 8),
          durationMinutes: 480,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-106",
          productId: products.ferro.id,
          workstationId: byCode.TLB.id,
          quantity: 6000,
          priority: "NORMAL",
          status: "SCHEDULED",
          dueDate: utcDay(5, 16),
          plannedStart: utcDay(0, 12),
          plannedEnd: utcDay(2, 12),
          durationMinutes: 720,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-107",
          productId: products.cough.id,
          workstationId: byCode.LLA.id,
          quantity: 4000,
          priority: "HIGH",
          status: "AT_RISK",
          dueDate: utcDay(1, 16),
          plannedStart: utcDay(2, 8),
          plannedEnd: utcDay(3, 16),
          durationMinutes: 960,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-108",
          productId: products.azith.id,
          workstationId: byCode.TLA.id,
          quantity: 5000,
          priority: "NORMAL",
          status: "SCHEDULED",
          dueDate: utcDay(6, 16),
          plannedStart: utcDay(2, 8),
          plannedEnd: utcDay(3, 8),
          durationMinutes: 480,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-109",
          productId: products.amox.id,
          workstationId: byCode.CLA.id,
          quantity: 9000,
          priority: "HIGH",
          status: "SCHEDULED",
          dueDate: utcDay(7, 16),
          plannedStart: utcDay(2, 8),
          plannedEnd: utcDay(3, 16),
          durationMinutes: 960,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-110",
          productId: products.para.id,
          workstationId: byCode.TLB.id,
          quantity: 7000,
          priority: "NORMAL",
          status: "SCHEDULED",
          dueDate: utcDay(6, 16),
          plannedStart: utcDay(3, 8),
          plannedEnd: utcDay(4, 8),
          durationMinutes: 480,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-111",
          productId: products.ferro.id,
          workstationId: byCode.PLA.id,
          quantity: 3000,
          priority: "LOW",
          status: "SCHEDULED",
          dueDate: utcDay(8, 16),
          plannedStart: utcDay(4, 8),
          plannedEnd: utcDay(5, 8),
          durationMinutes: 480,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-112",
          productId: products.cough.id,
          workstationId: byCode.LLA.id,
          quantity: 2500,
          priority: "NORMAL",
          status: "SCHEDULED",
          dueDate: utcDay(8, 16),
          plannedStart: utcDay(4, 8),
          plannedEnd: utcDay(5, 12),
          durationMinutes: 600,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-113",
          productId: products.amox.id,
          workstationId: byCode.PLA.id,
          quantity: 4000,
          priority: "HIGH",
          status: "SCHEDULED",
          dueDate: utcDay(9, 16),
          plannedStart: utcDay(5, 8),
          plannedEnd: utcDay(6, 8),
          durationMinutes: 480,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-114",
          productId: products.azith.id,
          workstationId: byCode.PLB.id,
          quantity: 3500,
          priority: "NORMAL",
          status: "SCHEDULED",
          dueDate: utcDay(9, 16),
          plannedStart: utcDay(3, 8),
          plannedEnd: utcDay(4, 12),
          durationMinutes: 600,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-115",
          productId: products.para.id,
          workstationId: byCode.TLA.id,
          quantity: 4500,
          priority: "LOW",
          status: "SCHEDULED",
          dueDate: utcDay(10, 16),
          plannedStart: utcDay(5, 8),
          plannedEnd: utcDay(5, 16),
          durationMinutes: 480,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-116",
          productId: products.ferro.id,
          workstationId: byCode.TLB.id,
          quantity: 2800,
          priority: "NORMAL",
          status: "IN_PROGRESS",
          dueDate: utcDay(7, 16),
          plannedStart: utcDay(5, 8),
          plannedEnd: utcDay(6, 12),
          durationMinutes: 600,
          isLocked: true,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-117",
          productId: products.amox.id,
          workstationId: byCode.CLA.id,
          quantity: 2000,
          priority: "CRITICAL",
          status: "UNSCHEDULED",
          dueDate: utcDay(4, 16),
          plannedStart: null,
          plannedEnd: null,
          durationMinutes: 480,
          isLocked: false,
        },
        {
          tenantId: tenant.id,
          orderNumber: "PO-118",
          productId: products.cough.id,
          workstationId: null,
          quantity: 1800,
          priority: "LOW",
          status: "UNSCHEDULED",
          dueDate: utcDay(12, 16),
          plannedStart: null,
          plannedEnd: null,
          durationMinutes: 360,
          isLocked: false,
        },
      ],
    });
  }

  const { ensurePlantModelDemoData } = await import("./seed-plant-model");
  await ensurePlantModelDemoData(prisma);

  await ensureOperationsPhase2DemoData(prisma);

  const tenantB = await getIsolationTenant(prisma);
  if (!tenantB) return;
  const bCount = await prisma.workstation.count({ where: { tenantId: tenantB.id } });
  if (bCount > 0) return;
  const productB = await prisma.product.findFirst({ where: { tenantId: tenantB.id } });
  if (!productB) return;
  const lineB = await prisma.workstation.create({
    data: {
      tenantId: tenantB.id,
      name: "Isolation Line",
      code: "ISO-1",
      capacityHoursPerDay: 8,
      active: true,
    },
  });
  await prisma.productionOrder.create({
    data: {
      tenantId: tenantB.id,
      orderNumber: "PO-B-1",
      productId: productB.id,
      workstationId: lineB.id,
      quantity: 100,
      priority: "NORMAL",
      status: "SCHEDULED",
      dueDate: utcDay(5, 16),
      plannedStart: utcDay(0, 8),
      plannedEnd: utcDay(0, 16),
      durationMinutes: 480,
      isLocked: false,
    },
  });
}
