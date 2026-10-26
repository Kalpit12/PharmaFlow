import type { PrismaClient } from "@prisma/client";

import { countRunningOpsByWorkstation } from "../src/lib/operations/gantt-running-window";

/** Keep open START ops on the now-line: actual start → max(now, planned end). */
export async function pinRunningShopFloorOps(prisma: PrismaClient, tenantId: string): Promise<number> {
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
    if (!latest.has(row.productionOperationId)) latest.set(row.productionOperationId, row.eventType);
    const type = latest.get(row.productionOperationId);
    if (type !== "START" && type !== "PAUSE" && type !== "RESUME") continue;
    if (closed.has(row.productionOperationId)) continue;
    if (row.eventType === "STOP") {
      closed.add(row.productionOperationId);
      continue;
    }
    if (row.eventType === "START") startedAt.set(row.productionOperationId, row.recordedAt);
  }

  const runningIds = [...latest.entries()]
    .filter(([id, type]) => (type === "START" || type === "RESUME") && startedAt.has(id))
    .map(([id]) => id);
  if (runningIds.length === 0) return 0;

  const now = new Date();
  let pinned = 0;
  for (const id of runningIds) {
    const op = await prisma.productionOperation.findFirst({
      where: { id, tenantId },
      select: { id: true, durationMinutes: true, setupMinutes: true, teardownMinutes: true, plannedEnd: true },
    });
    if (!op) continue;
    const start = startedAt.get(id)!;
    const minEnd = new Date(start.getTime() + Math.max(30, op.setupMinutes + op.durationMinutes + op.teardownMinutes) * 60_000);
    const end = new Date(Math.max(now.getTime() + 15 * 60_000, op.plannedEnd?.getTime() ?? 0, minEnd.getTime()));
    await prisma.productionOperation.update({
      where: { id: op.id },
      data: {
        status: "IN_PROGRESS",
        actualStart: start,
        plannedStart: start,
        plannedEnd: end.getTime() - start.getTime() > 36 * 3_600_000 ? minEnd : end,
        actualEnd: null,
      },
    });
    pinned += 1;
  }
  return pinned;
}

export async function assertSingleRunningOpPerWorkstation(prisma: PrismaClient, tenantId: string): Promise<void> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const events = await prisma.productionOperationEvent.findMany({
    where: { tenantId, recordedAt: { gte: since }, eventType: { in: ["START", "STOP", "PAUSE", "RESUME"] } },
    orderBy: { recordedAt: "desc" },
    select: { productionOperationId: true, eventType: true },
  });
  const latest = new Map<string, string>();
  for (const row of events) {
    if (!latest.has(row.productionOperationId)) latest.set(row.productionOperationId, row.eventType);
  }
  const runningIds = [...latest.entries()]
    .filter(([, type]) => type === "START" || type === "RESUME")
    .map(([id]) => id);
  const ops = await prisma.productionOperation.findMany({
    where: { tenantId, id: { in: runningIds } },
    select: { id: true, workstationId: true, workstation: { select: { name: true, allowedParallelJobs: true } } },
  });
  const capacity = new Map(
    ops
      .filter((op) => op.workstationId)
      .map((op) => [op.workstationId!, Math.max(1, op.workstation?.allowedParallelJobs ?? 1)])
  );
  const violations = countRunningOpsByWorkstation(
    ops.map((op) => ({ workstationId: op.workstationId, isRunning: true })),
    capacity
  );
  if (violations.length > 0) {
    const detail = violations
      .map((row) => {
        const name = ops.find((op) => op.workstationId === row.workstationId)?.workstation?.name ?? row.workstationId;
        return `${name}: ${row.running} running (allowed ${row.allowed})`;
      })
      .join("; ");
    throw new Error(`Max one running op per workstation (unless parallelCapacity > 1): ${detail}`);
  }
}
