import type { PrismaClient } from "@prisma/client";

import { PLANT_CAPACITY_HOURS_PER_DAY } from "../src/lib/operations/plant-shift-template";

const PRODUCTION_GROUPS = new Set([
  "LA-BLEND",
  "LA-COMP",
  "LA-COAT",
  "LA-FILL",
  "LA-PACK",
  "LA-BLISTER",
  "LA-LINE",
]);

export async function printLabAlliedUtilizationTable(prisma: PrismaClient, tenantId: string): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 86_400_000);
  const workstations = await prisma.workstation.findMany({
    where: { tenantId, active: true },
    include: { group: { select: { code: true } } },
    orderBy: { code: "asc" },
  });

  const ops = await prisma.productionOperation.findMany({
    where: {
      tenantId,
      plannedStart: { lt: horizon },
      plannedEnd: { gt: now },
      status: { not: "COMPLETED" },
      productionOrder: { orderKind: "FIRM" },
    },
    select: { workstationId: true, plannedStart: true, plannedEnd: true, setupMinutes: true, durationMinutes: true, teardownMinutes: true },
  });

  const plannedMinutesByWs = new Map<string, number>();
  for (const op of ops) {
    if (!op.workstationId || !op.plannedStart || !op.plannedEnd) continue;
    const start = Math.max(op.plannedStart.getTime(), now.getTime());
    const end = Math.min(op.plannedEnd.getTime(), horizon.getTime());
    if (end <= start) continue;
    const overlapMin = (end - start) / 60_000;
    plannedMinutesByWs.set(op.workstationId, (plannedMinutesByWs.get(op.workstationId) ?? 0) + overlapMin);
  }

  console.log("\n[utilization] Next 7 days (production lines)");
  console.log("workstation | planned h | shift h | util %");
  console.log("---|---:|---:|---:");
  for (const ws of workstations) {
    if (!ws.group?.code || !PRODUCTION_GROUPS.has(ws.group.code)) continue;
    const shiftHours =
      ws.code === "SFG-QUAR" || ws.code === "QC-PROC" ? 24 * 7 : PLANT_CAPACITY_HOURS_PER_DAY * 7;
    const plannedH = (plannedMinutesByWs.get(ws.id) ?? 0) / 60;
    const util = shiftHours > 0 ? Math.round((plannedH / shiftHours) * 100) : 0;
    console.log(`${ws.name} (${ws.code}) | ${plannedH.toFixed(1)} | ${shiftHours.toFixed(1)} | ${util}%`);
  }
}
