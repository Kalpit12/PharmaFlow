import type { PrismaClient } from "@prisma/client";

const IDLE_TARGETS: Array<{ code: string; operationCode: string }> = [
  { code: "CPD-010", operationCode: "PACK" },
  { code: "BPD-017", operationCode: "ENC" },
  { code: "BPD-089", operationCode: "PACK" },
];

/** If preferred-line weight starved a machine, move a future scheduled step onto it. */
export async function spreadLabAlliedIdleLines(prisma: PrismaClient, tenantId: string): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86_400_000);
  let moved = 0;

  for (const target of IDLE_TARGETS) {
    const ws = await prisma.workstation.findFirst({
      where: { tenantId, code: target.code },
      select: { id: true },
    });
    if (!ws) continue;
    const existing = await prisma.productionOperation.count({
      where: {
        tenantId,
        workstationId: ws.id,
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        plannedStart: { gte: now, lte: horizon },
      },
    });
    if (existing > 0) continue;

    const candidate = await prisma.productionOperation.findFirst({
      where: {
        tenantId,
        operationCode: target.operationCode,
        status: "SCHEDULED",
        plannedStart: { gte: now, lte: horizon },
        workstationId: { not: ws.id },
      },
      orderBy: { plannedStart: "asc" },
    });
    if (!candidate?.plannedStart || !candidate.plannedEnd) continue;
    await prisma.productionOperation.update({
      where: { id: candidate.id },
      data: { workstationId: ws.id },
    });
    moved += 1;
  }
  return moved;
}
