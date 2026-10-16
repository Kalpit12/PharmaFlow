import type { PrismaClient } from "@prisma/client";

/** 14 days of completed START/STOP pairs with spread timestamps for reporting demos. */
export async function seedLabAlliedShopFloorHistory(
  prisma: PrismaClient,
  tenantId: string,
  recordedById: string | null
): Promise<number> {
  const employees = await prisma.plantEmployee.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true },
    take: 8,
  });
  if (employees.length === 0) return 0;

  const completedOps = await prisma.productionOperation.findMany({
    where: { tenantId, status: "COMPLETED", actualEnd: { not: null } },
    orderBy: { actualEnd: "desc" },
    take: 80,
    select: { id: true, actualStart: true, actualEnd: true, durationMinutes: true },
  });

  let created = 0;
  for (let i = 0; i < completedOps.length; i += 1) {
    const op = completedOps[i]!;
    const existing = await prisma.productionOperationEvent.count({
      where: { tenantId, productionOperationId: op.id },
    });
    if (existing > 0) continue;

    const start = op.actualStart ?? new Date(Date.now() - (i + 3) * 86_400_000);
    const end =
      op.actualEnd ??
      new Date(start.getTime() + Math.round(op.durationMinutes * 60_000 * (0.85 + (i % 5) * 0.08)));
    const actor = employees[i % employees.length]!.id;
    const qtyGood = 5000 + (i % 7) * 400;
    const qtyReject = i % 4 === 0 ? 12 + (i % 20) : 0;

    await prisma.productionOperationEvent.createMany({
      data: [
        {
          tenantId,
          productionOperationId: op.id,
          eventType: "START",
          recordedAt: start,
          recordedById: actor,
          quantity: null,
        },
        {
          tenantId,
          productionOperationId: op.id,
          eventType: "STOP",
          recordedAt: end,
          recordedById: actor,
          quantity: qtyGood,
        },
      ],
    });
    if (qtyReject > 0) {
      await prisma.productionOperationEvent.create({
        data: {
          tenantId,
          productionOperationId: op.id,
          eventType: "SCRAP",
          recordedAt: new Date(end.getTime() - 15 * 60_000),
          recordedById: actor,
          quantity: qtyReject,
          reason: "In-process check",
        },
      });
    }
    created += 1;
  }

  return created;
}
