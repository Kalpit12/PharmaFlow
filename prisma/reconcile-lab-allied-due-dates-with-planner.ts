import type { PrismaClient } from "@prisma/client";

import { computeDueDateFromPlannedEnd } from "../src/lib/operations/sync-order-due-dates";
import type { TenantContext } from "../src/lib/server/tenant-context";
import { getOperationsPlanner } from "../src/lib/server/operations";

/** Bump stored due dates when the live planner schedule extends past current due dates. */
export async function reconcileLabAlliedDueDatesWithPlanner(
  prisma: PrismaClient,
  ctx: TenantContext
): Promise<number> {
  const window = {
    start: new Date(),
    end: new Date(Date.now() + 120 * 86_400_000),
    weeks: 8 as const,
  };
  const planner = await getOperationsPlanner(ctx, window, null);
  let updated = 0;

  for (const order of planner.orders) {
    if (order.orderKind !== "FIRM") continue;
    const lastEndIso = order.routing.operations.reduce<string | null>((latest, op) => {
      if (!op.plannedEnd) return latest;
      if (!latest || new Date(op.plannedEnd).getTime() > new Date(latest).getTime()) return op.plannedEnd;
      return latest;
    }, null);
    if (!lastEndIso) continue;

    const needed = computeDueDateFromPlannedEnd(new Date(lastEndIso), order.id);
    const row = await prisma.productionOrder.findUnique({
      where: { id: order.id },
      select: { dueDate: true },
    });
    if (!row || needed.getTime() <= row.dueDate.getTime()) continue;

    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { dueDate: needed },
    });
    updated += 1;
  }

  return updated;
}
