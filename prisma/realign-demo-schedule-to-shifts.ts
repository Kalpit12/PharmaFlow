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

/** Re-align demo schedules: finish-to-start within each order and no overlap on the same workstation. */
export async function realignDemoScheduleToShifts(prisma: PrismaClient, tenantId: string): Promise<number> {
  const workstations = await prisma.workstation.findMany({
    where: { tenantId, active: true },
    select: { id: true, code: true, capacityHoursPerDay: true, allowedParallelJobs: true },
  });
  const parallelByWsId = new Map(workstations.map((row) => [row.id, Math.max(1, row.allowedParallelJobs)]));
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

  const elapsedCalendar = buildWorkCalendar({
    capacityHoursPerDay: 24,
    shifts: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startMinute: 0,
      endMinute: 1_440,
    })),
  });

  const orders = await prisma.productionOrder.findMany({
    where: { tenantId, status: { not: "COMPLETED" }, orderKind: "FIRM" },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  const now = new Date();
  const wsCursor = new Map<string, Date>();
  const wsLanes = new Map<string, Date[]>();
  let updated = 0;

  function laneReadyAt(workstationId: string, calendar: WorkCalendar, parallel: number): Date {
    let lanes = wsLanes.get(workstationId);
    if (!lanes) {
      const seed = alignToCalendar(now, calendar);
      lanes = Array.from({ length: parallel }, () => seed);
      wsLanes.set(workstationId, lanes);
    }
    return lanes.reduce((min, value) => (value.getTime() < min.getTime() ? value : min), lanes[0]!);
  }

  function occupyLane(workstationId: string, end: Date, parallel: number): void {
    const lanes = wsLanes.get(workstationId);
    if (!lanes) return;
    let idx = 0;
    for (let i = 1; i < lanes.length; i += 1) {
      if (lanes[i]!.getTime() < lanes[idx]!.getTime()) idx = i;
    }
    lanes[idx] = end;
  }

  for (const order of orders) {
    const ops = await prisma.productionOperation.findMany({
      where: { tenantId, productionOrderId: order.id, status: { not: "COMPLETED" } },
      orderBy: { sequence: "asc" },
    });

    let orderCursor = alignToCalendar(now, elapsedCalendar);
    let firstStart: Date | null = null;
    let lastEnd: Date | null = null;

    for (const op of ops) {
      if (op.status === "COMPLETED" && op.plannedEnd) {
        orderCursor = op.plannedEnd;
        if (op.workstationId) {
          const prev = wsCursor.get(op.workstationId);
          if (!prev || op.plannedEnd.getTime() > prev.getTime()) {
            wsCursor.set(op.workstationId, op.plannedEnd);
          }
        }
        continue;
      }

      if (op.status === "IN_PROGRESS" && op.plannedStart && op.plannedEnd) {
        orderCursor = op.plannedEnd;
        if (op.workstationId) {
          const prev = wsCursor.get(op.workstationId);
          if (!prev || op.plannedEnd.getTime() > prev.getTime()) {
            wsCursor.set(op.workstationId, op.plannedEnd);
          }
        }
        if (!firstStart) firstStart = op.plannedStart;
        lastEnd = op.plannedEnd;
        continue;
      }

      let workstationId = op.workstationId;
      const wsCode = workstationId ? wsCodeById.get(workstationId) : null;
      const useElapsed = operationUsesElapsedCalendar(op.operationCode, wsCode);

      if (!workstationId && useElapsed) {
        const fallbackCode =
          op.operationCode === "QUAR" ? "SFG-QUAR" : op.operationCode === "QC" || op.operationCode === "QC-HOLD" ? "QC-PROC" : null;
        workstationId = fallbackCode ? (wsIdByCode.get(fallbackCode) ?? null) : null;
      }

      if (!workstationId && !useElapsed) continue;

      const calendar = useElapsed
        ? elapsedCalendar
        : workstationId
          ? calendars.get(workstationId)
          : undefined;
      if (!calendar) continue;

      const parallel = workstationId ? parallelByWsId.get(workstationId) ?? 1 : 1;
      const isQuarantine = wsCode === "SFG-QUAR";
      let candidate = orderCursor;
      if (workstationId && !isQuarantine) {
        const machineReady =
          parallel > 1
            ? laneReadyAt(workstationId, calendar, parallel)
            : wsCursor.get(workstationId) ?? alignToCalendar(now, calendar);
        if (machineReady.getTime() > candidate.getTime()) {
          candidate = machineReady;
        }
      }
      if (candidate.getTime() < now.getTime()) {
        candidate = alignToCalendar(now, calendar);
      }

      const start = alignToCalendar(candidate, calendar);
      const runMinutes = op.setupMinutes + op.durationMinutes + op.teardownMinutes;
      const end = useElapsed
        ? new Date(start.getTime() + runMinutes * 60_000)
        : addWorkingMinutesOnCalendar(start, runMinutes, calendar);

      if (!firstStart) firstStart = start;
      lastEnd = end;

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

      orderCursor = end;
      if (workstationId && !isQuarantine) {
        if (parallel > 1) occupyLane(workstationId, end, parallel);
        else wsCursor.set(workstationId, end);
      }
    }

    if (firstStart && lastEnd) {
      const orderOps = await prisma.productionOperation.findMany({
        where: { tenantId, productionOrderId: order.id },
        select: { status: true },
      });
      const hasInProgress = orderOps.some((row) => row.status === "IN_PROGRESS");
      const allCompleted = orderOps.length > 0 && orderOps.every((row) => row.status === "COMPLETED");
      await prisma.productionOrder.update({
        where: { id: order.id },
        data: {
          plannedStart: firstStart,
          plannedEnd: lastEnd,
          status: allCompleted ? "COMPLETED" : hasInProgress ? "IN_PROGRESS" : "SCHEDULED",
        },
      });
    }
  }

  await prisma.productionOrder.updateMany({
    where: { tenantId, orderKind: "PROSPECT" },
    data: { plannedStart: null, plannedEnd: null, workstationId: null, status: "UNSCHEDULED" },
  });

  return updated;
}
