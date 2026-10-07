import type { PrismaClient } from "@prisma/client";

function utcDaysAgo(days: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days, 9, 0, 0));
}

export async function ensureQualityDemoData(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) return;

  const existing = await prisma.qualityException.count({ where: { tenantId: tenant.id } });
  if (existing > 0) return;

  const owner = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
  const batch104 = await prisma.productionBatch.findFirst({
    where: { tenantId: tenant.id, batchNumber: "LAB-2026-003" },
    include: { productionOrder: true },
  });
  const batch115 = await prisma.productionBatch.findFirst({
    where: { tenantId: tenant.id, batchNumber: "LAB-2026-002" },
  });
  const apiLot = await prisma.inventoryLot.findFirst({
    where: { tenantId: tenant.id, batchCode: "RM-API-OK" },
  });

  if (!owner || !batch104) return;

  await prisma.qualityException.create({
    data: {
      tenantId: tenant.id,
      reference: "Q-2026-001",
      title: "Laboratory result pending for completed batch",
      description: "Batch remains on quality hold while awaiting laboratory confirmation.",
      type: "BATCH_ISSUE",
      severity: "CRITICAL",
      status: "INVESTIGATING",
      ownerId: owner.id,
      createdById: owner.id,
      dueDate: utcDaysAgo(-2),
      productionBatchId: batch104.id,
      productionOrderId: batch104.productionOrderId,
      productId: batch104.productionOrder.productId,
      investigationNotes: "Sample sent to QC lab. Hold remains explicit in batch operations.",
      findings: "No release decision recorded yet.",
      events: {
        create: [
          {
            tenantId: tenant.id,
            eventType: "CREATED",
            toStatus: "OPEN",
            note: "Linked to batch on quality hold.",
            actorId: owner.id,
            createdAt: utcDaysAgo(3),
          },
          {
            tenantId: tenant.id,
            eventType: "STATUS",
            fromStatus: "OPEN",
            toStatus: "INVESTIGATING",
            note: "Investigation started.",
            actorId: owner.id,
            createdAt: utcDaysAgo(2),
          },
        ],
      },
      correctiveActions: {
        create: {
          tenantId: tenant.id,
          description: "Review laboratory certificate when received.",
          ownerId: owner.id,
          dueDate: utcDaysAgo(-1),
          status: "IN_PROGRESS",
        },
      },
    },
  });

  await prisma.qualityException.create({
    data: {
      tenantId: tenant.id,
      reference: "Q-2026-002",
      title: "Input lot consumption incomplete on completed batch",
      description: "Completed batch lacks full input-lot genealogy for all BOM components.",
      type: "MATERIAL_ISSUE",
      severity: "HIGH",
      status: "ACTION_REQUIRED",
      createdById: owner.id,
      dueDate: utcDaysAgo(-4),
      productionBatchId: batch115?.id ?? null,
      inventoryLotId: apiLot?.id ?? null,
      events: {
        create: {
          tenantId: tenant.id,
          eventType: "CREATED",
          toStatus: "OPEN",
          note: "Raised from traceability gap review.",
          actorId: owner.id,
          createdAt: utcDaysAgo(5),
        },
      },
    },
  });

  await prisma.qualityException.create({
    data: {
      tenantId: tenant.id,
      reference: "Q-2026-003",
      title: "Documentation review for batch release packet",
      description: "Batch release documentation requires operations review before quality decision.",
      type: "DOCUMENTATION_ISSUE",
      severity: "MEDIUM",
      status: "OPEN",
      createdById: owner.id,
      events: {
        create: {
          tenantId: tenant.id,
          eventType: "CREATED",
          toStatus: "OPEN",
          note: "Unassigned documentation follow-up.",
          actorId: owner.id,
          createdAt: utcDaysAgo(1),
        },
      },
    },
  });

  console.log("Seeded quality exceptions for medicrest.");
}
