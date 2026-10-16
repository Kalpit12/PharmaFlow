import type { PrismaClient } from "@prisma/client";

import { buildStandardPlantShiftRows } from "../src/lib/operations/plant-shift-template";
import { migrateLegacyWorkstationsToMachines } from "./migrate-gantt-workstations";

type GroupDef = { code: string; name: string };
type MachineDef = { code: string; name: string; groupCode: string; departmentCode?: string; elapsedOnly?: boolean };

const GROUPS: GroupDef[] = [
  { code: "DISP-GRP", name: "Dispensing" },
  { code: "GRN-GRP", name: "Granulation" },
  { code: "CMP-GRP", name: "Compression" },
  { code: "COAT-GRP", name: "Coating" },
  { code: "ENC-GRP", name: "Encapsulation" },
  { code: "LIQ-GRP", name: "Liquids" },
  { code: "PKG-GRP", name: "Packaging" },
  { code: "QC-GRP", name: "QC" },
];

const MACHINES: MachineDef[] = [
  { code: "DISP", name: "Dispensing", groupCode: "DISP-GRP", departmentCode: "OSD" },
  { code: "GRN-1", name: "Granulator 1", groupCode: "GRN-GRP", departmentCode: "OSD" },
  { code: "GRN-2", name: "Granulator 2", groupCode: "GRN-GRP", departmentCode: "OSD" },
  { code: "FBD", name: "Fluid bed dryer", groupCode: "GRN-GRP", departmentCode: "OSD" },
  { code: "BLND", name: "Blender", groupCode: "GRN-GRP", departmentCode: "OSD" },
  { code: "CMP-1", name: "Compression 1", groupCode: "CMP-GRP", departmentCode: "OSD" },
  { code: "CMP-2", name: "Compression 2", groupCode: "CMP-GRP", departmentCode: "OSD" },
  { code: "CMP-3", name: "Compression 3", groupCode: "CMP-GRP", departmentCode: "OSD" },
  { code: "COAT", name: "Coater", groupCode: "COAT-GRP", departmentCode: "OSD" },
  { code: "ENC", name: "Encapsulator", groupCode: "ENC-GRP", departmentCode: "OSD" },
  { code: "COMPOUND-1", name: "Compounding vessel", groupCode: "LIQ-GRP", departmentCode: "LIQ" },
  { code: "LIQ-FILL", name: "Liquid filling", groupCode: "LIQ-GRP", departmentCode: "LIQ" },
  { code: "BLST-A", name: "Blister line A", groupCode: "PKG-GRP", departmentCode: "PKG" },
  { code: "BLST-B", name: "Blister line B", groupCode: "PKG-GRP", departmentCode: "PKG" },
  { code: "QC-HOLD", name: "QC hold bench", groupCode: "QC-GRP", departmentCode: "OSD", elapsedOnly: true },
];

const SHIFT_WEEKDAYS = [1, 2, 3, 4, 5, 6];

/** Machine-level plant, shifts, migration off legacy lines, and 20+ demo jobs. */
export async function ensureGanttSkyPlannerDemoSeed(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) return;

  const migrateReport = await migrateLegacyWorkstationsToMachines(prisma, tenant.id);
  if (migrateReport.operationsRemapped > 0) {
    console.log(
      `[gantt-seed] Migrated ${migrateReport.operationsRemapped} ops off legacy lines; deactivated ${migrateReport.legacyDeactivated} lines.`
    );
  }

  const site = await prisma.plantSite.findFirst({ where: { tenantId: tenant.id, code: "NBO-PLT" } });
  const deptByCode = new Map(
    (
      await prisma.plantDepartment.findMany({
        where: { tenantId: tenant.id, code: { in: ["OSD", "LIQ", "PKG"] } },
        select: { id: true, code: true },
      })
    ).map((row) => [row.code, row.id])
  );

  const groupByCode = new Map<string, string>();
  for (const group of GROUPS) {
    const row = await prisma.workstationGroup.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: group.code } },
      create: { tenantId: tenant.id, code: group.code, name: group.name },
      update: { name: group.name },
    });
    groupByCode.set(group.code, row.id);
  }

  const wsByCode = new Map<string, string>();
  for (const machine of MACHINES) {
    const groupId = groupByCode.get(machine.groupCode);
    if (!groupId) continue;
    const existing = await prisma.workstation.findFirst({
      where: { tenantId: tenant.id, code: machine.code },
      select: { id: true },
    });
    const row =
      existing ??
      (await prisma.workstation.create({
        data: {
          tenantId: tenant.id,
          code: machine.code,
          name: machine.name,
          capacityHoursPerDay: machine.elapsedOnly ? 24 : 16,
          active: true,
          siteId: site?.id ?? null,
          departmentId: machine.departmentCode ? deptByCode.get(machine.departmentCode) ?? null : null,
          groupId,
          efficiencyCoefficient: 1,
          qualificationStatus: "QUALIFIED",
          cleanStatus: "CLEAN",
        },
      }));
    await prisma.workstation.update({
      where: { id: row.id },
      data: {
        name: machine.name,
        groupId,
        capacityHoursPerDay: machine.elapsedOnly ? 24 : 16,
        active: true,
      },
    });
    wsByCode.set(machine.code, row.id);
    if (!machine.elapsedOnly) await ensureTwoShiftCalendar(prisma, tenant.id, row.id);
  }

  await ensureShowcaseOrders(prisma, tenant.id, wsByCode);
  await ensureBulkDemoOrders(prisma, tenant.id, wsByCode);
  await ensureRunningJobWithTimer(prisma, tenant.id, wsByCode);

  await refreshRelativeShowcaseTiming(prisma, tenant.id);

  const { syncStandardDemoRoutings } = await import("./sync-demo-routings");
  await syncStandardDemoRoutings(prisma, tenant.id);

  const { realignDemoScheduleToShifts } = await import("./realign-demo-schedule-to-shifts");
  const realigned = await realignDemoScheduleToShifts(prisma, tenant.id);
  if (realigned > 0) {
    console.log(`[gantt-seed] Realigned ${realigned} operations to shift calendars.`);
  }
}

async function ensureTwoShiftCalendar(prisma: PrismaClient, tenantId: string, workstationId: string) {
  await prisma.workstationShift.deleteMany({ where: { workstationId } });
  await prisma.workstationShift.createMany({
    data: buildStandardPlantShiftRows(SHIFT_WEEKDAYS).map((row) => ({
      tenantId,
      workstationId,
      ...row,
    })),
  });
}

async function ensureShowcaseOrders(prisma: PrismaClient, tenantId: string, wsByCode: Map<string, string>) {
  const para = await prisma.product.findFirst({ where: { tenantId, sku: "PARA-500-TAB" }, select: { id: true } });
  if (!para) return;

  const show = await prisma.productionOrder.findFirst({
    where: { tenantId, orderNumber: "GANTT-SHOW-001" },
    select: { id: true },
  });
  if (show) return;

  const order = await prisma.productionOrder.create({
    data: {
      tenantId,
      orderNumber: "GANTT-SHOW-001",
      productId: para.id,
      quantity: 8000,
      priority: "HIGH",
      status: "SCHEDULED",
      dueDate: daysFromNow(5, 16),
      durationMinutes: 960,
      isLocked: false,
    },
  });
  await prisma.productionBatch.create({
    data: { tenantId, productionOrderId: order.id, batchNumber: "BT-GANTT-01", plannedQuantity: 8000 },
  });

  const steps = [
    { seq: 10, code: "DISP", ws: "DISP", mins: 90, co: 45 },
    { seq: 20, code: "GRAN", ws: "GRN-1", mins: 300, co: 60 },
    { seq: 30, code: "FBD", ws: "FBD", mins: 210, co: 30 },
    { seq: 40, code: "BLND", ws: "BLND", mins: 90, co: 30 },
    { seq: 50, code: "COMP", ws: "CMP-2", mins: 780, co: 45 },
    { seq: 60, code: "COAT", ws: "COAT", mins: 420, co: 40 },
    { seq: 70, code: "QC", ws: "QC-HOLD", mins: 2880, co: 0, qc: true },
    { seq: 80, code: "PACK", ws: "BLST-A", mins: 540, co: 35 },
  ];
  let cursor = daysFromNow(-1, 6);
  for (const step of steps) {
    const start = new Date(cursor);
    const end = new Date(start.getTime() + step.mins * 60_000);
    cursor = end;
    await prisma.productionOperation.create({
      data: {
        tenantId,
        productionOrderId: order.id,
        operationCode: step.code,
        operationName: step.code,
        sequence: step.seq,
        workstationId: wsByCode.get(step.ws)!,
        durationMinutes: step.mins,
        setupMinutes: step.co,
        changeoverFamily: step.co > 0 ? "GENERAL_TABLET" : null,
        status: step.seq < 50 ? "COMPLETED" : "SCHEDULED",
        plannedStart: start,
        plannedEnd: end,
        actualStart: step.seq < 50 ? start : null,
        actualEnd: step.seq < 50 ? end : null,
        isLocked: false,
      },
    });
  }

  const lateOrder = await prisma.productionOrder.create({
    data: {
      tenantId,
      orderNumber: "GANTT-LATE-002",
      productId: para.id,
      quantity: 4000,
      priority: "NORMAL",
      status: "SCHEDULED",
      dueDate: daysFromNow(2, 16),
      durationMinutes: 240,
      isLocked: false,
    },
  });
  await prisma.productionBatch.create({
    data: { tenantId, productionOrderId: lateOrder.id, batchNumber: "BT-LATE-02", plannedQuantity: 4000 },
  });
  await prisma.productionOperation.create({
    data: {
      tenantId,
      productionOrderId: lateOrder.id,
      operationCode: "PACK",
      operationName: "PACK",
      sequence: 10,
      workstationId: wsByCode.get("BLST-B")!,
      durationMinutes: 240,
      setupMinutes: 30,
      changeoverFamily: "GENERAL_TABLET",
      status: "SCHEDULED",
      plannedStart: daysFromNow(-2, 8),
      plannedEnd: daysFromNow(-2, 12),
      isLocked: false,
    },
  });
}

async function ensureBulkDemoOrders(prisma: PrismaClient, tenantId: string, wsByCode: Map<string, string>) {
  const scheduledCount = await prisma.productionOrder.count({
    where: { tenantId, status: { in: ["SCHEDULED", "IN_PROGRESS", "AT_RISK"] }, orderKind: "FIRM" },
  });
  if (scheduledCount >= 28) return;

  const products = await prisma.product.findMany({
    where: { tenantId, sku: { in: ["PARA-500-TAB", "AMOX-500-CAP", "COUGH-SYR-100", "FERRO-FOLIC-TAB"] } },
    select: { id: true, sku: true },
  });
  if (products.length === 0) return;

  const templates: Array<{ sku: string; steps: Array<{ code: string; ws: string; mins: number }> }> = [
    {
      sku: "PARA-500-TAB",
      steps: [
        { code: "DISP", ws: "DISP", mins: 90 },
        { code: "GRAN", ws: "GRN-1", mins: 300 },
        { code: "COMP", ws: "CMP-1", mins: 720 },
        { code: "PACK", ws: "BLST-A", mins: 540 },
      ],
    },
    {
      sku: "AMOX-500-CAP",
      steps: [
        { code: "DISP", ws: "DISP", mins: 105 },
        { code: "ENC", ws: "ENC", mins: 600 },
        { code: "PACK", ws: "BLST-B", mins: 480 },
      ],
    },
    {
      sku: "COUGH-SYR-100",
      steps: [
        { code: "COMPOUND", ws: "COMPOUND-1", mins: 150 },
        { code: "FILL", ws: "LIQ-FILL", mins: 120 },
        { code: "PACK", ws: "BLST-A", mins: 60 },
      ],
    },
    {
      sku: "FERRO-FOLIC-TAB",
      steps: [
        { code: "BLND", ws: "BLND", mins: 90 },
        { code: "COMP", ws: "CMP-3", mins: 160 },
        { code: "COAT", ws: "COAT", mins: 140 },
        { code: "QC", ws: "QC-HOLD", mins: 60 },
        { code: "PACK", ws: "BLST-A", mins: 80 },
      ],
    },
  ];

  let created = 0;
  let dayOffset = 0;
  let guard = 0;
  while (scheduledCount + created < 28 && guard < 40) {
    guard += 1;
    const template = templates[(scheduledCount + created) % templates.length];
    const product = products.find((row) => row.sku === template.sku) ?? products[0];
    const orderNumber = `GANTT-DEMO-${String(scheduledCount + created + 1).padStart(3, "0")}`;
    const exists = await prisma.productionOrder.findFirst({ where: { tenantId, orderNumber }, select: { id: true } });
    if (exists) {
      created += 1;
      continue;
    }
    const order = await prisma.productionOrder.create({
      data: {
        tenantId,
        orderNumber,
        productId: product.id,
        quantity: 5000 + created * 250,
        priority: created % 5 === 0 ? "CRITICAL" : "NORMAL",
        status: "SCHEDULED",
        dueDate: daysFromNow(3 + (created % 10), 16),
        durationMinutes: template.steps.reduce((sum, step) => sum + step.mins, 0),
        isLocked: false,
      },
    });
    await prisma.productionBatch.create({
      data: {
        tenantId,
        productionOrderId: order.id,
        batchNumber: `BT-DEMO-${String(created + 1).padStart(3, "0")}`,
        plannedQuantity: 5000,
      },
    });
    let cursor = daysFromNow(dayOffset % 5, 6 + (created % 3) * 2);
    dayOffset += 1;
    for (let i = 0; i < template.steps.length; i += 1) {
      const step = template.steps[i];
      const start = new Date(cursor);
      const end = new Date(start.getTime() + step.mins * 60_000);
      cursor = end;
      await prisma.productionOperation.create({
        data: {
          tenantId,
          productionOrderId: order.id,
          operationCode: step.code,
          operationName: step.code,
          sequence: (i + 1) * 10,
          workstationId: wsByCode.get(step.ws)!,
          durationMinutes: step.mins,
          setupMinutes: i === 0 ? 30 : 20,
          changeoverFamily: step.ws === "QC-HOLD" ? null : "GENERAL_TABLET",
          status: "SCHEDULED",
          plannedStart: start,
          plannedEnd: end,
          isLocked: false,
        },
      });
    }
    created += 1;
  }

  const prospectExists = await prisma.productionOrder.findFirst({
    where: { tenantId, orderKind: "PROSPECT" },
    select: { id: true },
  });
  if (!prospectExists) {
    const amox = products.find((row) => row.sku === "AMOX-500-CAP");
    if (amox) {
      await prisma.productionOrder.create({
        data: {
          tenantId,
          orderNumber: `PRP-GANTT-${new Date().getUTCFullYear()}`,
          productId: amox.id,
          quantity: 12000,
          priority: "HIGH",
          status: "UNSCHEDULED",
          orderKind: "PROSPECT",
          dueDate: daysFromNow(14, 16),
          durationMinutes: 480,
          isLocked: false,
        },
      });
    }
  }
}

async function ensureRunningJobWithTimer(prisma: PrismaClient, tenantId: string, wsByCode: Map<string, string>) {
  const existing = await prisma.productionOrder.findFirst({
    where: { tenantId, orderNumber: "GANTT-RUN-001" },
    select: { id: true },
  });
  if (existing) return;

  const para = await prisma.product.findFirst({ where: { tenantId, sku: "PARA-500-TAB" }, select: { id: true } });
  const cmp1 = wsByCode.get("CMP-1");
  if (!para || !cmp1) return;

  const now = new Date();
  const start = new Date(now.getTime() - 2 * 3_600_000);
  const end = new Date(now.getTime() + 6 * 3_600_000);

  const order = await prisma.productionOrder.create({
    data: {
      tenantId,
      orderNumber: "GANTT-RUN-001",
      productId: para.id,
      quantity: 6000,
      priority: "HIGH",
      status: "IN_PROGRESS",
      dueDate: daysFromNow(4, 16),
      durationMinutes: 480,
      isLocked: false,
    },
  });
  await prisma.productionBatch.create({
    data: { tenantId, productionOrderId: order.id, batchNumber: "BT-GANTT-RUN", plannedQuantity: 6000 },
  });
  const op = await prisma.productionOperation.create({
    data: {
      tenantId,
      productionOrderId: order.id,
      operationCode: "COMP",
      operationName: "Compression",
      sequence: 10,
      workstationId: cmp1,
      durationMinutes: 480,
      setupMinutes: 30,
      changeoverFamily: "GENERAL_TABLET",
      status: "IN_PROGRESS",
      plannedStart: start,
      plannedEnd: end,
      actualStart: start,
      isLocked: false,
    },
  });
  await prisma.productionOperationEvent.create({
    data: { tenantId, productionOperationId: op.id, eventType: "START", recordedAt: start },
  });
}

async function refreshRelativeShowcaseTiming(prisma: PrismaClient, tenantId: string) {
  const lateOp = await prisma.productionOperation.findFirst({
    where: { tenantId, productionOrder: { orderNumber: "GANTT-LATE-002" } },
    select: { id: true },
  });
  if (lateOp) {
    await prisma.productionOperation.update({
      where: { id: lateOp.id },
      data: {
        plannedStart: daysFromNow(-2, 8),
        plannedEnd: daysFromNow(-2, 12),
        status: "SCHEDULED",
      },
    });
  }
}

function daysFromNow(offset: number, hourUtc = 8): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, hourUtc, 0, 0));
}
