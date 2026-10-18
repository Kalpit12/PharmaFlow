import type { PrismaClient } from "@prisma/client";

const LATE_DEMO_ORDERS = ["ORD044-2026/43", "ORD045-2026/44"] as const;

/** Two firm orders with due dates before achievable finish (Late tab demo). */
export async function seedLabAlliedLateDemoOrders(prisma: PrismaClient, tenantId: string): Promise<number> {
  let updated = 0;
  for (const orderNumber of LATE_DEMO_ORDERS) {
    const order = await prisma.productionOrder.findFirst({
      where: { tenantId, orderNumber, orderKind: "FIRM" },
      select: { id: true, plannedEnd: true },
    });
    if (!order?.plannedEnd) continue;
    const dueDate = new Date(order.plannedEnd.getTime() - 4 * 86_400_000);
    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { dueDate },
    });
    updated += 1;
  }
  return updated;
}
