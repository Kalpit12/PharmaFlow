import type { PrismaClient } from "@prisma/client";

import { computeDueDateFromPlannedEnd } from "../src/lib/operations/sync-order-due-dates";

/** Set each firm order due date to last planned operation end + 3–7 day buffer. */
export async function syncLabAlliedDueDatesAfterSchedule(prisma: PrismaClient, tenantId: string): Promise<number> {
  const orders = await prisma.productionOrder.findMany({
    where: { tenantId, orderKind: "FIRM" },
    select: {
      id: true,
      dueDate: true,
      operations: {
        select: { plannedEnd: true },
      },
    },
  });

  let updated = 0;
  for (const order of orders) {
    const lastEnd = order.operations.reduce<Date | null>((latest, op) => {
      if (!op.plannedEnd) return latest;
      if (!latest || op.plannedEnd.getTime() > latest.getTime()) return op.plannedEnd;
      return latest;
    }, null);
    if (!lastEnd) continue;

    const dueDate = computeDueDateFromPlannedEnd(lastEnd, order.id);
    if (dueDate.getTime() === order.dueDate.getTime()) continue;

    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { dueDate },
    });
    updated += 1;
  }

  return updated;
}
