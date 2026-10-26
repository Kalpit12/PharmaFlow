import type { PrismaClient, ProductionOperationEventType } from "@prisma/client";

import { jitterInRange, pickLabAlliedOperator } from "../src/lib/operations/lab-allied-operator-pick";
import { isQaHoldOperation } from "../src/lib/operations/elapsed-workstation";
import {
  addPlantDays,
  dueAtPlantClose,
  plantWeekday,
  startOfPlantDay,
} from "../src/lib/operations/plant-time";

type OpForLog = {
  id: string;
  operationCode: string;
  durationMinutes: number;
  setupMinutes: number;
  teardownMinutes: number;
  actualStart: Date | null;
  actualEnd: Date | null;
  workstationId: string | null;
  productionOrderId: string;
};

function plannedMinutes(op: OpForLog): number {
  return Math.max(20, op.setupMinutes + op.durationMinutes + op.teardownMinutes);
}

function actualFactor(seed: string): number {
  return 0.85 + jitterInRange(seed, 0, 35) / 100;
}

export async function writeOperationTimeline(
  prisma: PrismaClient,
  tenantId: string,
  op: OpForLog,
  options: { running?: boolean; quantity?: number }
): Promise<void> {
  const existing = await prisma.productionOperationEvent.findMany({
    where: { tenantId, productionOperationId: op.id },
    select: { eventType: true },
  });
  const hasStart = existing.some((row) => row.eventType === "START");
  const hasStop = existing.some((row) => row.eventType === "STOP");
  if (options.running && hasStart) return;
  if (!options.running && hasStart && hasStop) return;
  if (existing.length > 0) {
    await prisma.productionOperationEvent.deleteMany({
      where: { tenantId, productionOperationId: op.id },
    });
  }

  const ws = op.workstationId
    ? await prisma.workstation.findFirst({
        where: { id: op.workstationId },
        select: { group: { select: { code: true } } },
      })
    : null;
  const groupCode = ws?.group?.code ?? null;
  const planned = plannedMinutes(op);
  const factor = actualFactor(op.id);
  const actualMins = Math.max(15, Math.round(planned * factor));
  const end = op.actualEnd ?? new Date();
  const start = op.actualStart ?? new Date(end.getTime() - actualMins * 60_000);
  const operator = pickLabAlliedOperator({
    operationCode: op.operationCode,
    workstationGroupCode: groupCode,
    at: start,
    seed: op.id,
  });

  const events: Array<{
    eventType: ProductionOperationEventType;
    recordedAt: Date;
    quantity: number | null;
    reason: string;
  }> = [];

  events.push({
    eventType: "START",
    recordedAt: start,
    quantity: null,
    reason: operator.name,
  });

  const withPause = !options.running && !isQaHoldOperation(op.operationCode) && jitterInRange(op.id, 0, 4) === 0;
  if (withPause) {
    const pauseAfter = Math.round(actualMins * (0.35 + jitterInRange(`${op.id}-p`, 0, 20) / 100));
    const pauseAt = new Date(start.getTime() + pauseAfter * 60_000);
    const pauseMins = 8 + jitterInRange(`${op.id}-pd`, 0, 22);
    const resumeAt = new Date(pauseAt.getTime() + pauseMins * 60_000);
    events.push({
      eventType: "PAUSE",
      recordedAt: pauseAt,
      quantity: null,
      reason: `${operator.name} · waiting on clearance`,
    });
    events.push({
      eventType: "RESUME",
      recordedAt: resumeAt,
      quantity: null,
      reason: operator.name,
    });
  }

  if (!options.running) {
    const qty = options.quantity ?? 5000;
    const scrap = jitterInRange(op.id, 0, 5) === 0 ? 8 + jitterInRange(`${op.id}-s`, 0, 28) : 0;
    if (scrap > 0) {
      events.push({
        eventType: "SCRAP",
        recordedAt: new Date(end.getTime() - 6 * 60_000),
        quantity: scrap,
        reason: "In-process check",
      });
    }
    events.push({
      eventType: "STOP",
      recordedAt: new Date(end.getTime() - jitterInRange(`${op.id}-stop`, 0, 19) * 60_000),
      quantity: Math.max(1, qty - scrap),
      reason: operator.name,
    });
  }

  await prisma.productionOperationEvent.createMany({
    data: events.map((row) => ({
      tenantId,
      productionOperationId: op.id,
      eventType: row.eventType,
      recordedAt: row.recordedAt,
      quantity: row.quantity,
      reason: row.reason,
      recordedById: null,
    })),
  });
}

const HISTORY_SPECS: Array<{ orderNumber: string; sku: string; daysAgo: number; packWs: string; blendWs: string; fillWs?: string; lateOtif?: boolean }> = [
  { orderNumber: "ORD001-2026/1", sku: "PARA-500-TAB", daysAgo: 13, packWs: "BPD-090", blendWs: "BPD-061" },
  { orderNumber: "ORD002-2026/2", sku: "IBU-400-TAB", daysAgo: 12, packWs: "CPD-010", blendWs: "BPD-061" },
  { orderNumber: "ORD003-2026/3", sku: "AMOX-500-CAP", daysAgo: 11, packWs: "BPD-089", blendWs: "BPD-062", fillWs: "BPD-017" },
  { orderNumber: "ORD004-2026/4", sku: "CIP-250-TAB", daysAgo: 10, packWs: "BPD-051", blendWs: "BPD-061" },
  { orderNumber: "ORD005-2026/5", sku: "PARA-500-FC", daysAgo: 9, packWs: "CPD-010", blendWs: "BPD-061" },
  { orderNumber: "ORD006-2026/6", sku: "COAMOX-625-TAB", daysAgo: 8, packWs: "BPD-099", blendWs: "BPD-062" },
  { orderNumber: "ORD007-2026/7", sku: "MET-500-TAB", daysAgo: 7, packWs: "CPD-010", blendWs: "BPD-061", lateOtif: true },
  { orderNumber: "ORD008-2026/8", sku: "AMOX-500-CAP", daysAgo: 6, packWs: "BPD-089", blendWs: "BPD-062", fillWs: "BPD-017" },
  { orderNumber: "ORD009-2026/9", sku: "PARA-500-TAB", daysAgo: 5, packWs: "BPD-090", blendWs: "BPD-061" },
  { orderNumber: "ORD080-2026/79", sku: "IBU-400-TAB", daysAgo: 4, packWs: "CPD-010", blendWs: "BPD-061" },
  { orderNumber: "ORD081-2026/80", sku: "AMOX-DPS-125", daysAgo: 3, packWs: "BPD-009", blendWs: "BPD-062" },
  { orderNumber: "ORD082-2026/81", sku: "PARA-500-JAR1000", daysAgo: 2, packWs: "BPD-009", blendWs: "BPD-061" },
  { orderNumber: "ORD083-2026/82", sku: "AMOX-500-CAP", daysAgo: 8, packWs: "BPD-089", blendWs: "BPD-062", fillWs: "BPD-017" },
  { orderNumber: "ORD084-2026/83", sku: "PARA-500-TAB", daysAgo: 6, packWs: "CPD-010", blendWs: "BPD-061" },
  { orderNumber: "ORD085-2026/84", sku: "IBU-400-TAB", daysAgo: 3, packWs: "CPD-010", blendWs: "BPD-061", lateOtif: true },
];

function skipSunday(from: Date): Date {
  const day = startOfPlantDay(from);
  if (plantWeekday(day) === 0) return addPlantDays(day, -1);
  return day;
}

async function ensureCompletedHistoryOrders(prisma: PrismaClient, tenantId: string): Promise<number> {
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    select: { id: true },
    take: 8,
  });
  const wsByCode = new Map(
    (await prisma.workstation.findMany({ where: { tenantId }, select: { id: true, code: true } })).map((row) => [
      row.code,
      row.id,
    ])
  );
  let created = 0;
  const now = new Date();

  for (let i = 0; i < HISTORY_SPECS.length; i += 1) {
    const spec = HISTORY_SPECS[i]!;
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

    const finishDay = skipSunday(addPlantDays(startOfPlantDay(now), -spec.daysAgo));
    const packEnd = new Date(finishDay.getTime() + (14 * 60 + 20 + i * 7) * 60_000);
    const quantity = 4200 + i * 250;
    const customerId = customers[i % Math.max(1, customers.length)]?.id ?? null;
    const plannedEnd = new Date(packEnd.getTime() + 40 * 60_000);

    const order = await prisma.productionOrder.create({
      data: {
        tenantId,
        orderNumber: spec.orderNumber,
        productId: product.id,
        customerId,
        quantity,
        priority: i % 5 === 0 ? "HIGH" : "NORMAL",
        status: "COMPLETED",
        orderKind: "FIRM",
        dueDate: spec.lateOtif ? dueAtPlantClose(addPlantDays(finishDay, -1)) : dueAtPlantClose(addPlantDays(finishDay, 1)),
        durationMinutes: 1800,
        isLocked: true,
        plannedEnd,
        plannedStart: new Date(packEnd.getTime() - 3 * 86_400_000),
        workstationId: wsByCode.get(spec.packWs) ?? null,
      },
    });

    await prisma.productionBatch.create({
      data: {
        tenantId,
        productionOrderId: order.id,
        batchNumber: `B-HST-${String(i + 1).padStart(2, "0")}`,
        plannedQuantity: quantity,
        producedQuantity: Math.round(quantity * (0.96 + (i % 4) * 0.01)),
        productionStartedAt: new Date(packEnd.getTime() - 3 * 86_400_000),
        productionCompletedAt: packEnd,
      },
    });

    const processCode = spec.sku.includes("CAP") ? "ENC" : spec.sku.includes("DPS") ? "DPS" : "COMP";
    const processName =
      processCode === "ENC" ? "Capsule filling" : processCode === "DPS" ? "Oral liquid filling" : "Compression";
    const processWs =
      spec.fillWs ??
      (processCode === "ENC" ? "BPD-092" : processCode === "DPS" ? "BPD-009" : "BPD-076");
    const steps: Array<{ code: string; name: string; ws: string; mins: number; hoursBack: number }> = [
      { code: "BLND", name: "Blending", ws: spec.blendWs, mins: 280 + i * 8, hoursBack: 52 },
      { code: processCode, name: processName, ws: processWs, mins: 520 + i * 12, hoursBack: 36 },
      { code: "QUAR", name: "sFG quarantine", ws: "SFG-QUAR", mins: 360, hoursBack: 18 },
      { code: "QC", name: "QC release", ws: "QC-PROC", mins: 180, hoursBack: 12 },
      { code: "PACK", name: "Packing", ws: spec.packWs, mins: 480 + i * 10, hoursBack: 4 },
    ];

    for (let s = 0; s < steps.length; s += 1) {
      const step = steps[s]!;
      const wsId = wsByCode.get(step.ws);
      if (!wsId) continue;
      const end = new Date(packEnd.getTime() - step.hoursBack * 3_600_000);
      const factor = actualFactor(`${order.id}-${step.code}`);
      const actual = Math.round(step.mins * factor);
      const start = new Date(end.getTime() - actual * 60_000);
      await prisma.productionOperation.create({
        data: {
          tenantId,
          productionOrderId: order.id,
          operationCode: step.code,
          operationName: step.name,
          sequence: (s + 1) * 10,
          workstationId: wsId,
          durationMinutes: step.mins,
          setupMinutes: s === 0 ? 40 : 20,
          status: "COMPLETED",
          isLocked: true,
          plannedStart: start,
          plannedEnd: new Date(start.getTime() + step.mins * 60_000),
          actualStart: start,
          actualEnd: end,
          changeoverFamily: step.code === "QUAR" || step.code === "QC" ? null : spec.blendWs === "BPD-062" ? "BETA_LACTAM" : "GENERAL_TABLET",
        },
      });
    }
    created += 1;
  }

  return created;
}

/** 14 days of completed START/PAUSE/RESUME/STOP by roster operators. */
export async function seedLabAlliedShopFloorHistory(
  prisma: PrismaClient,
  tenantId: string,
  _recordedById: string | null
): Promise<number> {
  const createdOrders = await ensureCompletedHistoryOrders(prisma, tenantId);

  const completedOps = await prisma.productionOperation.findMany({
    where: { tenantId, status: "COMPLETED" },
    select: {
      id: true,
      operationCode: true,
      durationMinutes: true,
      setupMinutes: true,
      teardownMinutes: true,
      actualStart: true,
      actualEnd: true,
      workstationId: true,
      productionOrderId: true,
      productionOrder: { select: { quantity: true } },
    },
  });

  let logged = 0;
  for (const op of completedOps) {
    const before = await prisma.productionOperationEvent.count({
      where: { tenantId, productionOperationId: op.id },
    });
    await writeOperationTimeline(prisma, tenantId, op, {
      quantity: op.productionOrder.quantity,
    });
    const after = await prisma.productionOperationEvent.count({
      where: { tenantId, productionOperationId: op.id },
    });
    if (after > before) logged += 1;
  }

  const runningOps = await prisma.productionOperation.findMany({
    where: { tenantId, status: "IN_PROGRESS" },
    select: {
      id: true,
      operationCode: true,
      durationMinutes: true,
      setupMinutes: true,
      teardownMinutes: true,
      actualStart: true,
      actualEnd: true,
      workstationId: true,
      productionOrderId: true,
    },
  });
  for (const op of runningOps) {
    await prisma.productionOperationEvent.deleteMany({
      where: { tenantId, productionOperationId: op.id, eventType: "START", recordedById: { not: null } },
    });
    const startOffset = 37 + jitterInRange(op.id, 0, 143);
    const actualStart = op.actualStart ?? new Date(Date.now() - startOffset * 60_000);
    await writeOperationTimeline(
      prisma,
      tenantId,
      { ...op, actualStart },
      { running: true }
    );
  }

  return createdOrders + logged;
}
