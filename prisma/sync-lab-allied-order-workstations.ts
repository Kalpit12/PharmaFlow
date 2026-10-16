import type { PrismaClient } from "@prisma/client";

/** Roll production order workstation + dates from the current in-progress or next scheduled step. */
export async function syncLabAlliedOrderWorkstations(prisma: PrismaClient, tenantId: string): Promise<number> {
  const orders = await prisma.productionOrder.findMany({
    where: { tenantId, orderKind: "FIRM" },
    select: { id: true },
  });
  let updated = 0;
  for (const order of orders) {
    const ops = await prisma.productionOperation.findMany({
      where: { tenantId, productionOrderId: order.id },
      orderBy: { sequence: "asc" },
      select: {
        status: true,
        workstationId: true,
        plannedStart: true,
        plannedEnd: true,
      },
    });
    const focus =
      ops.find((row) => row.status === "IN_PROGRESS") ??
      ops.find((row) => row.status === "SCHEDULED" && row.plannedStart) ??
      ops.find((row) => row.plannedStart) ??
      ops[0];
    if (!focus) continue;
    const firstStart = ops.find((row) => row.plannedStart)?.plannedStart ?? null;
    const lastEnd = ops.reduce<Date | null>((latest, row) => {
      if (!row.plannedEnd) return latest;
      if (!latest || row.plannedEnd.getTime() > latest.getTime()) return row.plannedEnd;
      return latest;
    }, null);
    await prisma.productionOrder.update({
      where: { id: order.id },
      data: {
        workstationId: focus.workstationId,
        plannedStart: firstStart,
        plannedEnd: lastEnd,
      },
    });
    updated += 1;
  }
  return updated;
}
