import type { PrismaClient } from "@prisma/client";

function utcDaysAgo(days: number, hour = 8): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days, hour, 0, 0));
}

export async function ensureBatchDemoData(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  if (!tenant) return;

  const tenantId = tenant.id;

  const existing = await prisma.productionBatch.count({ where: { tenantId } });
  if (existing > 0) return;

  const reviewer = await prisma.user.findFirst({ where: { tenantId } });
  if (!reviewer) return;

  async function order(orderNumber: string) {
    return prisma.productionOrder.findUnique({
      where: { tenantId_orderNumber: { tenantId, orderNumber } },
      include: { product: true },
    });
  }

  const po116 = await order("PO-116");
  const po115 = await order("PO-115");
  const po104 = await order("PO-104");
  const po105 = await order("PO-105");
  const po106 = await order("PO-106");
  if (!po116 || !po115 || !po104 || !po105 || !po106) return;

  await prisma.productionOrder.updateMany({
    where: { tenantId, orderNumber: { in: ["PO-104", "PO-105", "PO-106", "PO-115"] } },
    data: { status: "COMPLETED" },
  });

  const batch116 = await prisma.productionBatch.create({
    data: {
      tenantId,
      productionOrderId: po116.id,
      batchNumber: "LAB-2026-001",
      plannedQuantity: po116.quantity,
      producedQuantity: null,
      qualityStatus: "PENDING_REVIEW",
      productionStartedAt: utcDaysAgo(1, 8),
      reviewOwnerId: reviewer.id,
    },
  });

  const batch115 = await prisma.productionBatch.create({
    data: {
      tenantId,
      productionOrderId: po115.id,
      batchNumber: "LAB-2026-002",
      plannedQuantity: po115.quantity,
      producedQuantity: 6800,
      qualityStatus: "PENDING_REVIEW",
      productionStartedAt: utcDaysAgo(4, 8),
      productionCompletedAt: utcDaysAgo(2, 16),
      reviewOwnerId: reviewer.id,
    },
  });

  const batch104 = await prisma.productionBatch.create({
    data: {
      tenantId,
      productionOrderId: po104.id,
      batchNumber: "LAB-2026-003",
      plannedQuantity: po104.quantity,
      producedQuantity: 12000,
      qualityStatus: "ON_HOLD",
      holdReason: "Awaiting laboratory result",
      lastQualityAction: "HOLD",
      lastQualityActionAt: utcDaysAgo(1, 10),
      lastQualityActionById: reviewer.id,
      productionStartedAt: utcDaysAgo(5, 8),
      productionCompletedAt: utcDaysAgo(3, 16),
      reviewOwnerId: reviewer.id,
      qualityEvents: {
        create: {
          tenantId,
          action: "HOLD",
          reason: "Awaiting laboratory result",
          actorId: reviewer.id,
          createdAt: utcDaysAgo(1, 10),
        },
      },
    },
  });

  await prisma.productionBatch.create({
    data: {
      tenantId,
      productionOrderId: po105.id,
      batchNumber: "LAB-2026-004",
      plannedQuantity: po105.quantity,
      producedQuantity: 8000,
      qualityStatus: "RELEASED",
      lastQualityAction: "RELEASE",
      lastQualityActionAt: utcDaysAgo(2, 11),
      lastQualityActionById: reviewer.id,
      productionStartedAt: utcDaysAgo(6, 8),
      productionCompletedAt: utcDaysAgo(4, 16),
      reviewOwnerId: reviewer.id,
      qualityEvents: {
        create: {
          tenantId,
          action: "RELEASE",
          reason: "Packaging inspection complete",
          actorId: reviewer.id,
          createdAt: utcDaysAgo(2, 11),
        },
      },
    },
  });

  await prisma.productionBatch.create({
    data: {
      tenantId,
      productionOrderId: po106.id,
      batchNumber: "LAB-2026-005",
      plannedQuantity: po106.quantity,
      producedQuantity: 6000,
      qualityStatus: "REJECTED",
      holdReason: "Manufacturing exception",
      lastQualityAction: "REJECT",
      lastQualityActionAt: utcDaysAgo(1, 15),
      lastQualityActionById: reviewer.id,
      productionStartedAt: utcDaysAgo(7, 8),
      productionCompletedAt: utcDaysAgo(5, 16),
      reviewOwnerId: reviewer.id,
      qualityEvents: {
        create: {
          tenantId,
          action: "REJECT",
          reason: "Manufacturing exception",
          actorId: reviewer.id,
          createdAt: utcDaysAgo(1, 15),
        },
      },
    },
  });

  const api = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId, sku: "AMOX-API-KG" } } });
  const blister = await prisma.product.findUnique({
    where: { tenantId_sku: { tenantId, sku: "BLISTER-ALU-ALU" } },
  });
  const apiLot = api
    ? await prisma.inventoryLot.findFirst({ where: { tenantId, productId: api.id }, orderBy: { receivedAt: "desc" } })
    : null;

  if (api && blister) {
    await prisma.productionBatchInputLot.createMany({
      data: [
        {
          tenantId,
          batchId: batch104.id,
          productId: api.id,
          inventoryLotId: apiLot?.id ?? null,
          quantityUsed: apiLot ? 120 : null,
        },
        {
          tenantId,
          batchId: batch104.id,
          productId: blister.id,
          inventoryLotId: null,
          quantityUsed: null,
        },
        {
          tenantId,
          batchId: batch115.id,
          productId: api.id,
          inventoryLotId: null,
          quantityUsed: null,
        },
      ],
    });
  }

  console.log("Seeded production batches for lab-allied.", { batch116: batch116.batchNumber, batch104: batch104.batchNumber });
}
