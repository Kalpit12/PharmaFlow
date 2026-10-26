import type { PrismaClient } from "@prisma/client";

import {
  addWorkingMinutesOnCalendar,
  alignToCalendar,
  buildWorkCalendar,
  type WorkCalendar,
} from "../src/lib/operations/calendar";
import { addPlantDays, dueAtPlantClose, startOfPlantDay } from "../src/lib/operations/plant-time";

type WipPackSpec = {
  orderNumber: string;
  sku: string;
  batch: string;
  packWs: string;
  customerIdx: number;
  packMins: number;
  dueDays: number;
};

/** QC-released bulk ready for packing — packing lines busy from day 1 after replan. */
const AWAITING_PACK_SPECS: WipPackSpec[] = [
  { orderNumber: "ORD056-2026/55", sku: "PARA-500-TAB", batch: "B-WIP-01", packWs: "BPD-090", customerIdx: 1, packMins: 920, dueDays: 12 },
  { orderNumber: "ORD057-2026/56", sku: "IBU-400-TAB", batch: "B-WIP-02", packWs: "CPD-010", customerIdx: 2, packMins: 840, dueDays: 14 },
  { orderNumber: "ORD058-2026/57", sku: "CIP-250-TAB", batch: "B-WIP-03", packWs: "BPD-051", customerIdx: 3, packMins: 960, dueDays: 16 },
  { orderNumber: "ORD059-2026/58", sku: "AMOX-500-CAP", batch: "B-WIP-04", packWs: "BPD-089", customerIdx: 4, packMins: 1080, dueDays: 18 },
  { orderNumber: "ORD060-2026/59", sku: "AMOX-500-CAP", batch: "B-WIP-05", packWs: "BPD-099", customerIdx: 5, packMins: 1020, dueDays: 20 },
  { orderNumber: "ORD061-2026/60", sku: "AMOX-500-CAP", batch: "B-WIP-09", packWs: "BPD-089", customerIdx: 4, packMins: 960, dueDays: 17 },
  { orderNumber: "ORD062-2026/61", sku: "PARA-500-FC", batch: "B-WIP-10", packWs: "BPD-051", customerIdx: 1, packMins: 900, dueDays: 14 },
  { orderNumber: "ORD063-2026/62", sku: "PARA-500-JAR1000", batch: "B-WIP-06", packWs: "BPD-009", customerIdx: 0, packMins: 700, dueDays: 11 },
  { orderNumber: "ORD064-2026/63", sku: "AMOX-500-JAR500", batch: "B-WIP-07", packWs: "BPD-009", customerIdx: 0, packMins: 640, dueDays: 13 },
  { orderNumber: "ORD065-2026/64", sku: "PARA-500-FC", batch: "B-WIP-08", packWs: "BPD-051", customerIdx: 1, packMins: 880, dueDays: 15 },
];

const LEGACY_PACK_NUMBERS = [
  "ORD-JAR-2026/01",
  "ORD-JAR-2026/02",
  "PACK-WIP-01",
  "PACK-WIP-02",
  "PACK-WIP-03",
  "PACK-WIP-04",
  "PACK-WIP-05",
  "PACK-WIP-06",
  "PACK-WIP-07",
  "PACK-WIP-08",
  "PACK-WIP-09",
  "PACK-WIP-10",
];

function familyForStep(code: string, ws: string): string | null {
  if (code === "QUAR" || code === "QC") return null;
  if (code === "ENC" || ws === "BPD-062" || ws === "BPD-075") return "BETA_LACTAM";
  return "GENERAL_TABLET";
}

export async function seedLabAlliedAwaitingPackingWip(
  prisma: PrismaClient,
  tenantId: string,
  wsByCode: Map<string, string>,
  customerIds: string[]
): Promise<number> {
  const now = new Date();
  let created = 0;

  await prisma.productionOrder.deleteMany({
    where: { tenantId, orderNumber: { in: LEGACY_PACK_NUMBERS } },
  });

  for (const spec of AWAITING_PACK_SPECS) {
    const existing = await prisma.productionOrder.findFirst({
      where: { tenantId, orderNumber: spec.orderNumber },
      select: { id: true },
    });
    if (existing) continue;

    const product = await prisma.product.findFirst({
      where: { tenantId, sku: spec.sku },
      select: { id: true },
    });
    if (!product) continue;

    const routing = await prisma.productRouting.findFirst({
      where: { tenantId, productId: product.id, active: true },
      include: {
        operations: {
          orderBy: { sequence: "asc" },
          include: { resources: true },
        },
      },
    });
    if (!routing || routing.operations.length === 0) continue;

    const packRoutingOp = routing.operations.find((op) => op.code === "PACK");
    if (!packRoutingOp) continue;

    const packWsId = wsByCode.get(spec.packWs);
    if (!packWsId) continue;

    const customerId = customerIds[spec.customerIdx % customerIds.length] ?? customerIds[0];
    if (!customerId) continue;

    const order = await prisma.productionOrder.create({
      data: {
        tenantId,
        orderNumber: spec.orderNumber,
        productId: product.id,
        customerId,
        quantity: 8000,
        priority: "NORMAL",
        status: "IN_PROGRESS",
        orderKind: "FIRM",
        dueDate: dueAtPlantClose(addPlantDays(startOfPlantDay(now), spec.dueDays)),
        durationMinutes: routing.operations.reduce((sum, op) => sum + op.runMinutesPerBatch, 0),
        isLocked: false,
        workstationId: packWsId,
      },
    });

    await prisma.productionBatch.create({
      data: {
        tenantId,
        productionOrderId: order.id,
        batchNumber: spec.batch,
        plannedQuantity: order.quantity,
      },
    });

    let hoursBack = 72;
    for (const routingOp of routing.operations) {
      const isPack = routingOp.code === "PACK";
      const wsId = isPack
        ? packWsId
        : (routingOp.resources[0]?.workstationId ??
          wsByCode.get(
            routingOp.code === "BLND"
              ? spec.sku.startsWith("AMOX") || spec.sku.startsWith("COAMOX")
                ? "BPD-062"
                : "BPD-061"
              : routingOp.code === "COMP"
                ? "BPD-076"
                : routingOp.code === "ENC"
                  ? "BPD-092"
                  : routingOp.code === "COAT"
                    ? "BPD-078"
                    : routingOp.code === "QUAR"
                      ? "SFG-QUAR"
                      : "QC-PROC"
          ) ??
          null);

      if (!wsId) continue;

      const duration = isPack ? spec.packMins : routingOp.runMinutesPerBatch;
      const setup = isPack ? 40 : routingOp.setupMinutes;
      const family = familyForStep(routingOp.code, spec.packWs);

      if (isPack) {
        await prisma.productionOperation.create({
          data: {
            tenantId,
            productionOrderId: order.id,
            routingOperationId: routingOp.id,
            operationCode: routingOp.code,
            operationName: routingOp.name,
            sequence: routingOp.sequence,
            workstationId: wsId,
            durationMinutes: duration,
            setupMinutes: setup,
            changeoverFamily: family,
            status: "SCHEDULED",
            isLocked: false,
          },
        });
        continue;
      }

      const end = new Date(now.getTime() - hoursBack * 3_600_000);
      const start = new Date(end.getTime() - (duration + setup) * 60_000);
      hoursBack += Math.max(4, Math.round((duration + setup) / 60));

      await prisma.productionOperation.create({
        data: {
          tenantId,
          productionOrderId: order.id,
          routingOperationId: routingOp.id,
          operationCode: routingOp.code,
          operationName: routingOp.name,
          sequence: routingOp.sequence,
          workstationId: wsId,
          durationMinutes: duration,
          setupMinutes: setup,
          changeoverFamily: family,
          status: "COMPLETED",
          isLocked: false,
          plannedStart: start,
          plannedEnd: end,
          actualStart: start,
          actualEnd: end,
        },
      });
    }

    created += 1;
  }

  return created;
}

/** Place remaining PACK steps on packing lines in the first 2–3 plant days. */
export async function scheduleAwaitingPackingSoon(prisma: PrismaClient, tenantId: string): Promise<number> {
  const now = new Date();
  const workstations = await prisma.workstation.findMany({
    where: { tenantId, active: true },
    select: { id: true, code: true, capacityHoursPerDay: true },
  });
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

  const cursorByWs = new Map<string, Date>();
  let updated = 0;
  const packNumbers = AWAITING_PACK_SPECS.map((row) => row.orderNumber);

  for (const orderNumber of packNumbers) {
    const order = await prisma.productionOrder.findFirst({
      where: { tenantId, orderNumber },
      include: { operations: { orderBy: { sequence: "asc" } } },
    });
    if (!order) continue;
    const incomplete = order.operations.filter((op) => op.status !== "COMPLETED");
    const pack = incomplete.find((op) => op.operationCode === "PACK");
    if (!pack || incomplete.some((op) => op.operationCode !== "PACK")) continue;
    if (pack.status === "IN_PROGRESS") continue;
    if (!pack.workstationId) continue;
    const calendar = calendars.get(pack.workstationId);
    if (!calendar) continue;
    const cursor = cursorByWs.get(pack.workstationId) ?? now;
    const start = alignToCalendar(cursor, calendar);
    const run = pack.setupMinutes + pack.durationMinutes + pack.teardownMinutes;
    const end = addWorkingMinutesOnCalendar(start, run, calendar);
    await prisma.productionOperation.update({
      where: { id: pack.id },
      data: {
        status: "SCHEDULED",
        plannedStart: start,
        plannedEnd: end,
        actualStart: null,
        actualEnd: null,
      },
    });
    await prisma.productionOrder.update({
      where: { id: order.id },
      data: {
        workstationId: pack.workstationId,
        plannedStart: start,
        plannedEnd: end,
        status: "IN_PROGRESS",
      },
    });
    cursorByWs.set(pack.workstationId, end);
    updated += 1;
  }

  return updated;
}
