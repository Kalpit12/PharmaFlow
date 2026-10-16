import { getPrisma } from "@/lib/server/db";

/** Operation ids with the latest shop-floor event = START (no STOP yet). */
export async function loadActiveShopFloorTimerOperationIds(tenantId: string): Promise<Set<string>> {
  const prisma = getPrisma();
  const since = new Date(Date.now() - 90 * 86_400_000);
  const events = await prisma.productionOperationEvent.findMany({
    where: { tenantId, recordedAt: { gte: since } },
    orderBy: { recordedAt: "desc" },
    select: { productionOperationId: true, eventType: true },
  });
  const seen = new Set<string>();
  const open = new Set<string>();
  for (const row of events) {
    if (seen.has(row.productionOperationId)) continue;
    seen.add(row.productionOperationId);
    if (row.eventType === "START") open.add(row.productionOperationId);
  }
  return open;
}
