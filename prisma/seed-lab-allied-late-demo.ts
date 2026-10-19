import type { PrismaClient } from "@prisma/client";

const LATE_DEMO_ORDERS = ["ORD044-2026/43", "ORD045-2026/44"] as const;

/** Two firm orders with due dates before achievable finish (Late tab demo). */
export async function seedLabAlliedLateDemoOrders(prisma: PrismaClient, tenantId: string): Promise<number> {
  let updated = 0;
  for (const orderNumber of LATE_DEMO_ORDERS) {
    const order = await prisma.productionOrder.findFirst({
      where: { tenantId, orderNumber, orderKind: "FIRM" },
      select: {
        id: true,
        plannedEnd: true,
        operations: { select: { plannedEnd: true }, where: { plannedEnd: { not: null } } },
      },
    });
    if (!order) continue;
    const opEnds = order.operations.map((row) => row.plannedEnd).filter(Boolean) as Date[];
    const achievableEnd =
      opEnds.length > 0
        ? opEnds.reduce((latest, row) => (row.getTime() > latest.getTime() ? row : latest))
        : order.plannedEnd;
    if (!achievableEnd) continue;
    const dueDate = new Date(achievableEnd.getTime() - 7 * 86_400_000);
    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { dueDate, plannedEnd: achievableEnd },
    });
    updated += 1;
  }
  return updated;
}
