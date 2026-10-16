import type { PrismaClient } from "@prisma/client";

import {
  addWorkingMinutesOnCalendar,
  alignToCalendar,
  buildWorkCalendar,
  type WorkCalendar,
} from "../src/lib/operations/calendar";
import { isElapsedOnlyWorkstation } from "../src/lib/operations/elapsed-workstation";

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
      workstationId: { not: null },
      status: { not: "COMPLETED" },
    },
    orderBy: [{ productionOrderId: "asc" }, { sequence: "asc" }],
  });

  let updated = 0;
  let cursorByOrder = new Map<string, Date>();
  const now = new Date();

  const elapsedCalendar = buildWorkCalendar({
    capacityHoursPerDay: 24,
    shifts: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startMinute: 0,
      endMinute: 1_440,
    })),
  });

  for (const op of ops) {
    if (!op.workstationId) continue;
    const wsCode = wsCodeById.get(op.workstationId);
    const calendar = isElapsedOnlyWorkstation(wsCode)
      ? elapsedCalendar
      : calendars.get(op.workstationId);
    if (!calendar) continue;

    const orderCursor = cursorByOrder.get(op.productionOrderId) ?? alignToCalendar(now, calendar);
    const start = alignToCalendar(orderCursor, calendar);
    const runMinutes = op.setupMinutes + op.durationMinutes + op.teardownMinutes;
    const end = isElapsedOnlyWorkstation(wsCode)
      ? new Date(start.getTime() + runMinutes * 60_000)
      : addWorkingMinutesOnCalendar(start, runMinutes, calendar);

    if (
      !op.plannedStart ||
      !op.plannedEnd ||
      op.plannedStart.getTime() !== start.getTime() ||
      op.plannedEnd.getTime() !== end.getTime()
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
