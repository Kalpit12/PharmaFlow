import type { PrismaClient } from "@prisma/client";

import {
  addWorkingMinutesOnCalendar,
  alignToCalendar,
  buildWorkCalendar,
} from "../src/lib/operations/calendar";

/** Move not-started scheduled ops so plannedStart is not before now (planner drift during long seeds). */
export async function bumpPastScheduledStarts(prisma: PrismaClient, tenantId: string): Promise<number> {
  const now = new Date();
  const workstations = await prisma.workstation.findMany({
    where: { tenantId, active: true },
    select: { id: true, capacityHoursPerDay: true },
  });
  const shifts = await prisma.workstationShift.findMany({ where: { tenantId } });
  const calendars = new Map(
    workstations.map((ws) => [
      ws.id,
      buildWorkCalendar({
        capacityHoursPerDay: ws.capacityHoursPerDay,
        shifts: shifts
          .filter((row) => row.workstationId === ws.id)
          .map((row) => ({
            weekday: row.weekday,
            startMinute: row.startMinute,
            endMinute: row.endMinute,
          })),
      }),
    ])
  );

  const ops = await prisma.productionOperation.findMany({
    where: {
      tenantId,
      status: "SCHEDULED",
      plannedStart: { lt: now },
      productionOrder: { orderKind: "FIRM" },
    },
    select: {
      id: true,
      workstationId: true,
      setupMinutes: true,
      durationMinutes: true,
      teardownMinutes: true,
      plannedEnd: true,
    },
  });

  let updated = 0;
  for (const op of ops) {
    if (!op.workstationId) continue;
    const calendar = calendars.get(op.workstationId);
    if (!calendar) continue;
    const runMinutes = op.setupMinutes + op.durationMinutes + op.teardownMinutes;
    const start = alignToCalendar(now, calendar);
    const end = addWorkingMinutesOnCalendar(start, runMinutes, calendar);
    await prisma.productionOperation.update({
      where: { id: op.id },
      data: { plannedStart: start, plannedEnd: end },
    });
    updated += 1;
  }
  return updated;
}
