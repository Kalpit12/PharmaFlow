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

function runMinutes(op: { setupMinutes: number; durationMinutes: number; teardownMinutes: number }): number {
  return op.setupMinutes + op.durationMinutes + op.teardownMinutes;
}

type WipTarget = {
  orderNumber: string;
  /** Operation code for the step currently in progress on the shop floor. */
  activeOperationCode: string;
};

/** ~⅓ of firm orders already mid-route with 3–4 active shop-floor timers. */
const WIP_TARGETS: WipTarget[] = [
  { orderNumber: "ORD010-2026/9", activeOperationCode: "PACK" },
  { orderNumber: "ORD011-2026/10", activeOperationCode: "COMP" },
  { orderNumber: "ORD012-2026/11", activeOperationCode: "ENC" },
  { orderNumber: "ORD013-2026/12", activeOperationCode: "DPS" },
  { orderNumber: "ORD014-2026/13", activeOperationCode: "QUAR" },
  { orderNumber: "ORD015-2026/14", activeOperationCode: "QC" },
  { orderNumber: "ORD016-2026/15", activeOperationCode: "PACK" },
  { orderNumber: "ORD017-2026/16", activeOperationCode: "PACK" },
  { orderNumber: "ORD018-2026/17", activeOperationCode: "ENC" },
  { orderNumber: "ORD019-2026/18", activeOperationCode: "COMP" },
  { orderNumber: "ORD020-2026/19", activeOperationCode: "QUAR" },
  { orderNumber: "ORD021-2026/20", activeOperationCode: "QC" },
];

export async function applyLabAlliedSteadyStateWip(
  prisma: PrismaClient,
  tenantId: string,
  recordedById: string | null
): Promise<{ wipOrders: number; runningTimers: number }> {
  const workstations = await prisma.workstation.findMany({
    where: { tenantId, active: true },
    select: { id: true, code: true, capacityHoursPerDay: true },
  });
  const wsCodeById = new Map(workstations.map((row) => [row.id, row.code]));
  const shifts = await prisma.workstationShift.findMany({ where: { tenantId } });
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

  await prisma.productionOperationEvent.deleteMany({ where: { tenantId } });

  const now = new Date();
  const runningOperationIds: string[] = [];
  let wipOrders = 0;

  for (const target of WIP_TARGETS) {
    const order = await prisma.productionOrder.findFirst({
      where: { tenantId, orderNumber: target.orderNumber, orderKind: "FIRM" },
      select: { id: true },
    });
    if (!order) continue;

    const ops = await prisma.productionOperation.findMany({
      where: { tenantId, productionOrderId: order.id },
      orderBy: { sequence: "asc" },
    });
    const activeIdx = ops.findIndex((op) => op.operationCode === target.activeOperationCode);
    if (activeIdx < 0) continue;

    let cursorHoursBack = 6 + activeIdx * 5;

    for (let i = 0; i < activeIdx; i += 1) {
      const op = ops[i]!;
      const minutes = runMinutes(op);
      const end = new Date(now.getTime() - cursorHoursBack * 3_600_000);
      const start = new Date(end.getTime() - minutes * 60_000);
      cursorHoursBack += Math.max(2, Math.round(minutes / 60));

      await prisma.productionOperation.update({
        where: { id: op.id },
        data: {
          status: "COMPLETED",
          plannedStart: start,
          plannedEnd: end,
          actualStart: start,
          actualEnd: end,
        },
      });
    }

    const active = ops[activeIdx]!;
    const wsCode = active.workstationId ? wsCodeById.get(active.workstationId) : null;
    const useElapsed = operationUsesElapsedCalendar(active.operationCode, wsCode);
    const calendar: WorkCalendar =
      useElapsed && active.workstationId
        ? elapsedCalendar
        : (active.workstationId ? calendars.get(active.workstationId) : undefined) ?? elapsedCalendar;

    const activeRun = runMinutes(active);
    const activeStart = alignToCalendar(new Date(now.getTime() - 2.5 * 3_600_000), calendar);
    const activeEnd = useElapsed
      ? new Date(activeStart.getTime() + activeRun * 60_000)
      : addWorkingMinutesOnCalendar(activeStart, activeRun, calendar);

    await prisma.productionOperation.update({
      where: { id: active.id },
      data: {
        status: "IN_PROGRESS",
        plannedStart: activeStart,
        plannedEnd: activeEnd,
        actualStart: activeStart,
        actualEnd: null,
      },
    });
    runningOperationIds.push(active.id);

    for (let i = activeIdx + 1; i < ops.length; i += 1) {
      await prisma.productionOperation.update({
        where: { id: ops[i]!.id },
        data: {
          status: "SCHEDULED",
          plannedStart: null,
          plannedEnd: null,
          actualStart: null,
          actualEnd: null,
        },
      });
    }

    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { status: "IN_PROGRESS" },
    });
    wipOrders += 1;
  }

  let runningTimers = 0;
  for (const operationId of runningOperationIds) {
    await prisma.productionOperationEvent.create({
      data: {
        tenantId,
        productionOperationId: operationId,
        eventType: "START",
        recordedAt: new Date(now.getTime() - 2 * 3_600_000),
        recordedById,
      },
    });
    runningTimers += 1;
  }

  return { wipOrders, runningTimers };
}
