import { getPrisma } from "@/lib/server/db";

export type OpenShopFloorTimer = {
  operationId: string;
  latestType: "START" | "PAUSE" | "RESUME";
  /** First START of the current open interval (after the last STOP). */
  startedAt: Date;
  isRunning: boolean;
};

const OPEN_TYPES = new Set(["START", "PAUSE", "RESUME"]);

export async function loadOpenShopFloorTimers(tenantId: string): Promise<Map<string, OpenShopFloorTimer>> {
  const prisma = getPrisma();
  const since = new Date(Date.now() - 90 * 86_400_000);
  const events = await prisma.productionOperationEvent.findMany({
    where: { tenantId, recordedAt: { gte: since }, eventType: { in: ["START", "STOP", "PAUSE", "RESUME"] } },
    orderBy: { recordedAt: "desc" },
    select: { productionOperationId: true, eventType: true, recordedAt: true },
  });

  const latest = new Map<string, string>();
  const startedAt = new Map<string, Date>();
  const closed = new Set<string>();

  for (const row of events) {
    const opId = row.productionOperationId;
    if (!latest.has(opId)) latest.set(opId, row.eventType);

    const latestType = latest.get(opId);
    if (!latestType || !OPEN_TYPES.has(latestType)) continue;
    if (closed.has(opId)) continue;

    if (row.eventType === "STOP") {
      closed.add(opId);
      continue;
    }
    if (row.eventType === "START") {
      startedAt.set(opId, row.recordedAt);
    }
  }

  const open = new Map<string, OpenShopFloorTimer>();
  for (const [operationId, latestType] of latest) {
    if (!OPEN_TYPES.has(latestType)) continue;
    const start = startedAt.get(operationId);
    if (!start) continue;
    open.set(operationId, {
      operationId,
      latestType: latestType as "START" | "PAUSE" | "RESUME",
      startedAt: start,
      isRunning: latestType === "START" || latestType === "RESUME",
    });
  }
  return open;
}

/** Operation ids with an open run (latest START or RESUME — not paused, not stopped). */
export async function loadActiveShopFloorTimerOperationIds(tenantId: string): Promise<Set<string>> {
  const open = await loadOpenShopFloorTimers(tenantId);
  const ids = new Set<string>();
  for (const row of open.values()) {
    if (row.isRunning) ids.add(row.operationId);
  }
  return ids;
}

export async function loadOpenShopFloorTimerOperationIds(tenantId: string): Promise<Set<string>> {
  return new Set((await loadOpenShopFloorTimers(tenantId)).keys());
}
