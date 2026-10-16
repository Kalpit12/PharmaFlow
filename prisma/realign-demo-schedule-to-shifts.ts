import type { PrismaClient } from "@prisma/client";

import {
  addWorkingMinutesOnCalendar,
  alignToCalendar,
  buildWorkCalendar,
  type WorkCalendar,
} from "../src/lib/operations/calendar";
import { isElapsedOnlyWorkstation } from "../src/lib/operations/elapsed-workstation";

const ELAPSED_OPERATION_CODES = new Set(["QUAR", "QC", "QC-HOLD"]);

function operationUsesElapsedCalendar(operationCode: string, workstationCode: string | null | undefined): boolean {
  if (isElapsedOnlyWorkstation(workstationCode ?? undefined)) return true;
  return ELAPSED_OPERATION_CODES.has(operationCode.trim().toUpperCase());
}

/** Re-align demo DB planned times to workstation shift calendars (Mon–Sat, no Sunday). */
export async function realignDemoScheduleToShifts(prisma: PrismaClient, tenantId: string): Promise<number> {
  const workstations = await prisma.workstation.findMany({
    where: { tenantId, active: true },
    select: { id: true, code: true, capacityHoursPerDay: true },
  });
  const shifts = await prisma.workstationShift.findMany({ where: { tenantId } });
  const wsCodeById = new Map(workstations.map((row) => [row.id, row.code]));
  const wsIdByCode = new Map(workstations.map((row) => [row.code, row.id]));
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
      status: { not: "COMPLETED" },
    },
    orderBy: [{ productionOrderId: "asc" }, { sequence: "asc" }],
  });

  let updated = 0;
  const cursorByOrder = new Map<string, Date>();
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
    let workstationId = op.workstationId;
    const wsCode = workstationId ? wsCodeById.get(workstationId) : null;
    const useElapsed = operationUsesElapsedCalendar(op.operationCode, wsCode);

    if (!workstationId && useElapsed) {
      const fallbackCode =
        op.operationCode === "QUAR" ? "SFG-QUAR" : op.operationCode === "QC" || op.operationCode === "QC-HOLD" ? "QC-PROC" : null;
      workstationId = fallbackCode ? (wsIdByCode.get(fallbackCode) ?? null) : null;
      if (workstationId && workstationId !== op.workstationId) {
        await prisma.productionOperation.update({
          where: { id: op.id },
          data: { workstationId },
        });
      }
    }

    if (!workstationId && !useElapsed) continue;

    const calendar = useElapsed
      ? elapsedCalendar
      : workstationId
        ? calendars.get(workstationId)
        : undefined;
    if (!calendar) continue;

    const orderCursor = cursorByOrder.get(op.productionOrderId) ?? alignToCalendar(now, calendar);
    const start = alignToCalendar(orderCursor, calendar);
    const runMinutes = op.setupMinutes + op.durationMinutes + op.teardownMinutes;
    const end = useElapsed
      ? new Date(start.getTime() + runMinutes * 60_000)
      : addWorkingMinutesOnCalendar(start, runMinutes, calendar);

    if (
      !op.plannedStart ||
      !op.plannedEnd ||
      op.plannedStart.getTime() !== start.getTime() ||
      op.plannedEnd.getTime() !== end.getTime() ||
      op.workstationId !== workstationId
    ) {
      await prisma.productionOperation.update({
        where: { id: op.id },
        data: {
          workstationId: workstationId ?? op.workstationId,
          plannedStart: start,
          plannedEnd: end,
        },
      });
      updated += 1;
    }
    cursorByOrder.set(op.productionOrderId, end);
  }

  return updated;
}
