import type { PrismaClient } from "@prisma/client";

import {
  addWorkingMinutesOnCalendar,
  alignToCalendar,
  buildWorkCalendar,
  type WorkCalendar,
} from "../src/lib/operations/calendar";

/** Re-align demo DB planned times to workstation shift calendars (Mon–Sat, no Sunday). */
export async function realignDemoScheduleToShifts(prisma: PrismaClient, tenantId: string): Promise<number> {
  const workstations = await prisma.workstation.findMany({
    where: { tenantId, active: true },
    select: { id: true, code: true, capacityHoursPerDay: true },
  });
  const shifts = await prisma.workstationShift.findMany({ where: { tenantId } });
  const wsCodeById = new Map(workstations.map((row) => [row.id, row.code]));
  const calendars = new Map<string, WorkCalendar>();
  for (const ws of workstations) {
    calendars.set(
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
      })
    );
  }

  const ops = await prisma.productionOperation.findMany({
    where: {
      tenantId,
      plannedStart: { not: null },
      plannedEnd: { not: null },
      workstationId: { not: null },
    },
    orderBy: [{ productionOrderId: "asc" }, { sequence: "asc" }],
  });

  let updated = 0;
  let cursorByOrder = new Map<string, Date>();
  const now = new Date();

  for (const op of ops) {
    if (!op.workstationId || wsCodeById.get(op.workstationId) === "QC-HOLD") continue;
    const calendar = calendars.get(op.workstationId);
    if (!calendar) continue;

    const orderCursor = cursorByOrder.get(op.productionOrderId) ?? alignToCalendar(now, calendar);
    const start = alignToCalendar(orderCursor, calendar);
    const runMinutes =
      op.setupMinutes + op.durationMinutes + op.teardownMinutes;
    const end = addWorkingMinutesOnCalendar(start, runMinutes, calendar);

    if (
      op.plannedStart!.getTime() !== start.getTime() ||
      op.plannedEnd!.getTime() !== end.getTime()
    ) {
      await prisma.productionOperation.update({
        where: { id: op.id },
        data: { plannedStart: start, plannedEnd: end },
      });
      updated += 1;
    }
    cursorByOrder.set(op.productionOrderId, end);
  }

  return updated;
}
