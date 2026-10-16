import type { PrismaClient } from "@prisma/client";

import {
  LAB_ALLIED_DEMO_EMAIL,
  LAB_ALLIED_DEMO_LEGAL_NAME,
  LAB_ALLIED_DEMO_SLUG,
} from "../src/lib/demo-tenant";
import { hashPassword } from "../src/lib/server/password";
import { addPlantDays, plantWeekday, plantYmd, startOfPlantDay } from "../src/lib/operations/plant-time";
import { buildStandardPlantShiftRows } from "../src/lib/operations/plant-shift-template";
import { shiftTimeLabel } from "../src/lib/server/workstation-roster";

type GroupDef = { code: string; name: string };
type MachineDef = {
  code: string;
  name: string;
  groupCode: string;
  shift: "plant" | "saturday" | "qc24";
};

const GROUPS: GroupDef[] = [
  { code: "LA-BLEND", name: "Blending" },
  { code: "LA-COMP", name: "Compression" },
  { code: "LA-COAT", name: "Coating" },
  { code: "LA-FILL", name: "Filling" },
  { code: "LA-BLISTER", name: "Blistering/Packing" },
  { code: "LA-LINE", name: "Line" },
  { code: "LA-QUAR", name: "Quarantine" },
  { code: "LA-QC", name: "QC" },
];

const MACHINES: MachineDef[] = [
  { code: "BPD-061", name: "Blender octagonal 1000kg", groupCode: "LA-BLEND", shift: "plant" },
  { code: "BPD-062", name: "LabClav Blending 500kg", groupCode: "LA-BLEND", shift: "plant" },
  { code: "BPD-075", name: "LabClav Compression", groupCode: "LA-COMP", shift: "plant" },
  { code: "BPD-078", name: "ACG Coating", groupCode: "LA-COAT", shift: "plant" },
  { code: "BPD-092", name: "Capsule Filling-ACG", groupCode: "LA-FILL", shift: "plant" },
  { code: "BPD-036", name: "Capsule Filling-Chinese", groupCode: "LA-FILL", shift: "plant" },
  { code: "BPD-017", name: "Capsule Filling Small Batch", groupCode: "LA-FILL", shift: "plant" },
  { code: "BPD-090", name: "ACG Blister Tablet Packing", groupCode: "LA-BLISTER", shift: "plant" },
  { code: "BPD-051", name: "Blister Packing Alu/Alu Lablas", groupCode: "LA-BLISTER", shift: "plant" },
  { code: "CPD-010", name: "Blister Machine-BMAX", groupCode: "LA-BLISTER", shift: "plant" },
  { code: "BPD-089", name: "Capsule Line Packing", groupCode: "LA-BLISTER", shift: "plant" },
  { code: "BPD-099", name: "Capsules Line packing II", groupCode: "LA-BLISTER", shift: "plant" },
  { code: "BPD-009", name: "Bulk (counting) Packing", groupCode: "LA-BLISTER", shift: "plant" },
  { code: "DPS-LINE-1", name: "Dps Line 1", groupCode: "LA-LINE", shift: "plant" },
  { code: "BPD-096", name: "DPS Line 2", groupCode: "LA-LINE", shift: "plant" },
  { code: "SFG-QUAR", name: "sFG QUARANTINE", groupCode: "LA-QUAR", shift: "qc24" },
  { code: "QC-PROC", name: "QC PROCESS", groupCode: "LA-QC", shift: "qc24" },
];

function daysFromNow(offset: number, hourUtc = 11): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, hourUtc, 0, 0));
}

async function applyPlantShifts(prisma: PrismaClient, tenantId: string, workstationId: string, mode: MachineDef["shift"]) {
  await prisma.workstationShift.deleteMany({ where: { workstationId } });
  if (mode === "qc24") {
    await prisma.workstationShift.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        tenantId,
        workstationId,
        weekday,
        startMinute: 0,
        endMinute: 1_440,
      })),
    });
    return;
  }

  const shiftRows = buildStandardPlantShiftRows([1, 2, 3, 4, 5, 6]);
  await prisma.workstationShift.createMany({
    data: shiftRows.map((row) => ({ tenantId, workstationId, ...row })),
  });
}

/** Fictional SkyPlanner-layout demo tenant — not Lab & Allied customer ERP data. */
export async function ensureLabAlliedDemoSeed(prisma: PrismaClient) {
  let tenant = await prisma.tenant.findUnique({ where: { slug: LAB_ALLIED_DEMO_SLUG } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: LAB_ALLIED_DEMO_LEGAL_NAME, slug: LAB_ALLIED_DEMO_SLUG, status: "DEMO" },
    });
  }

  const devPassword = process.env.AUTH_DEV_PASSWORD;
  if (!devPassword) throw new Error("AUTH_DEV_PASSWORD must be set to seed Lab & Allied demo.");

  const userExists = await prisma.user.findUnique({ where: { email: LAB_ALLIED_DEMO_EMAIL } });
  if (!userExists) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: "Lab Demo Planner",
        email: LAB_ALLIED_DEMO_EMAIL,
        passwordHash: await hashPassword(devPassword),
        role: "MANAGER",
        status: "ACTIVE",
      },
    });
  }

  await prisma.planningPolicy.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id },
    update: {},
  });

  let site = await prisma.plantSite.findFirst({ where: { tenantId: tenant.id, code: "LA-DEMO" } });
  if (!site) {
    site = await prisma.plantSite.create({
      data: { tenantId: tenant.id, name: "Demo plant", code: "LA-DEMO", timezone: "Africa/Nairobi" },
    });
  }
  let dept = await prisma.plantDepartment.findFirst({ where: { tenantId: tenant.id, code: "MFG" } });
  if (!dept) {
    dept = await prisma.plantDepartment.create({
      data: { tenantId: tenant.id, siteId: site.id, name: "Manufacturing", code: "MFG" },
    });
  }

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
    const row = await prisma.workstation.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: machine.code } },
      create: {
        tenantId: tenant.id,
        code: machine.code,
        name: machine.name,
        capacityHoursPerDay: machine.shift === "qc24" ? 24 : 18,
        active: true,
        siteId: site.id,
        departmentId: dept.id,
        groupId,
        efficiencyCoefficient: 1,
        qualificationStatus: "QUALIFIED",
        cleanStatus: "CLEAN",
      },
      update: {
        name: machine.name,
        active: true,
        groupId,
        siteId: site.id,
        departmentId: dept.id,
        capacityHoursPerDay: machine.shift === "qc24" ? 24 : 18,
      },
    });
    wsByCode.set(machine.code, row.id);
    await applyPlantShifts(prisma, tenant.id, row.id, machine.shift);
  }

  await prisma.workstation.updateMany({
    where: { tenantId: tenant.id, code: { notIn: MACHINES.map((row) => row.code) } },
    data: { active: false },
  });

  const products = [
    {
      sku: "PARA-500-TAB",
      name: "Paracetamol 500mg",
      category: "Analgesic",
      dosageForm: "Tablet",
      validatedBatchSize: 8000,
    },
    {
      sku: "AMOX-500-CAP",
      name: "Amoxicillin 500mg",
      category: "Antibiotic",
      dosageForm: "Capsule",
      validatedBatchSize: 12000,
    },
    {
      sku: "AMOX-DPS-125",
      name: "Amoxicillin powder for oral suspension 125mg/5ml",
      category: "Antibiotic",
      dosageForm: "Dry powder for suspension",
      validatedBatchSize: 6000,
    },
  ];
  for (const row of products) {
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: row.sku } },
      create: {
        tenantId: tenant.id,
        sku: row.sku,
        name: row.name,
        category: row.category,
        dosageForm: row.dosageForm,
        unit: "pack",
        status: "ACTIVE",
        validatedBatchSize: row.validatedBatchSize,
        description: "Demo SKU for scheduling layout only.",
      },
      update: { name: row.name, validatedBatchSize: row.validatedBatchSize, status: "ACTIVE" },
    });
  }

  await syncLabAlliedRoutings(prisma, tenant.id, wsByCode);

  await prisma.schedulePlanOperation.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.schedulePlanOrder.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.schedulePlan.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.productionOperation.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.productionBatch.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.productionOrder.deleteMany({ where: { tenantId: tenant.id } });

  await seedLabAlliedOrders(prisma, tenant.id, wsByCode);
  await linkLabAlliedOrdersToRoutings(prisma, tenant.id, wsByCode);
  await prisma.productionOperation.deleteMany({
    where: { tenantId: tenant.id, productionOrder: { orderKind: "PROSPECT" } },
  });

  await prisma.productionOperation.updateMany({
    where: { tenantId: tenant.id },
    data: { plannedStart: null, plannedEnd: null },
  });
  await prisma.productionOrder.updateMany({
    where: { tenantId: tenant.id, orderKind: "FIRM" },
    data: { plannedStart: null, plannedEnd: null, workstationId: null },
  });

  await ensureLabAlliedEmployees(prisma, tenant.id, dept.id);
  await syncLabAlliedRoster(prisma, tenant.id);
}

async function ensureLabAlliedEmployees(prisma: PrismaClient, tenantId: string, departmentId: string) {
  const operators = [
    { code: "OP-001", name: "Grace Wanjiku" },
    { code: "OP-002", name: "James Otieno" },
    { code: "OP-003", name: "Mary Akinyi" },
    { code: "OP-004", name: "Peter Kamau" },
    { code: "OP-005", name: "Sarah Mwangi" },
    { code: "OP-006", name: "David Ochieng" },
    { code: "OP-007", name: "Lucy Njeri" },
    { code: "OP-008", name: "Daniel Mutua" },
  ];
  for (const row of operators) {
    await prisma.plantEmployee.upsert({
      where: { tenantId_code: { tenantId, code: row.code } },
      create: { tenantId, departmentId, code: row.code, name: row.name, status: "ACTIVE" },
      update: { name: row.name, status: "ACTIVE", departmentId },
    });
  }
}

async function syncLabAlliedRoster(prisma: PrismaClient, tenantId: string) {
  const employees = await prisma.plantEmployee.findMany({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { code: "asc" },
  });
  if (employees.length === 0) return;

  await prisma.workstationRosterAssignment.deleteMany({ where: { tenantId } });

  const workstations = await prisma.workstation.findMany({
    where: { tenantId, active: true },
    include: { shifts: true },
  });

  const anchor = startOfPlantDay(new Date());
  const rows: Array<{
    tenantId: string;
    workstationId: string;
    date: Date;
    startMinute: number;
    endMinute: number;
    employeeId: string;
    shiftLabel: string;
  }> = [];

  for (let offset = 0; offset < 21; offset += 1) {
    const day = addPlantDays(anchor, offset);
    const weekday = plantWeekday(day);
    const ymd = plantYmd(day);
    const [y, m, d] = ymd.split("-").map(Number);
    const dateOnly = new Date(Date.UTC(y!, m! - 1, d!));

    for (const ws of workstations) {
      const dayShifts = ws.shifts.filter((shift) => shift.weekday === weekday);
      dayShifts.forEach((shift, shiftIndex) => {
        const employee = employees[(ws.code.charCodeAt(0) + offset + shiftIndex) % employees.length]!;
        rows.push({
          tenantId,
          workstationId: ws.id,
          date: dateOnly,
          startMinute: shift.startMinute,
          endMinute: shift.endMinute,
          employeeId: employee.id,
          shiftLabel: shiftTimeLabel(shift.startMinute, shift.endMinute),
        });
      });
    }
  }

  for (let i = 0; i < rows.length; i += 100) {
    await prisma.workstationRosterAssignment.createMany({ data: rows.slice(i, i + 100) });
  }
}

type RouteStep = {
  code: string;
  name: string;
  runMinutes: number;
  setupMinutes: number;
  wsCodes: string[];
  isQcHold?: boolean;
};

async function syncLabAlliedRoutings(prisma: PrismaClient, tenantId: string, wsByCode: Map<string, string>) {
  const templates: Array<{ sku: string; name: string; family: string; steps: RouteStep[] }> = [
    {
      sku: "PARA-500-TAB",
      name: "Tablet blend, compress, pack",
      family: "GENERAL_TABLET",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 360, setupMinutes: 45, wsCodes: ["BPD-061", "BPD-062"] },
        { code: "COMP", name: "Compression", runMinutes: 720, setupMinutes: 60, wsCodes: ["BPD-075"] },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 480, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 240, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        {
          code: "PACK",
          name: "Blister packing",
          runMinutes: 900,
          setupMinutes: 45,
          wsCodes: ["BPD-090", "BPD-051", "CPD-010"],
        },
      ],
    },
    {
      sku: "AMOX-500-CAP",
      name: "Capsule fill and pack",
      family: "BETA_LACTAM",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 300, setupMinutes: 45, wsCodes: ["BPD-062"] },
        {
          code: "ENC",
          name: "Capsule filling",
          runMinutes: 840,
          setupMinutes: 90,
          wsCodes: ["BPD-092", "BPD-036", "BPD-017"],
        },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 360, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 180, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        {
          code: "PACK",
          name: "Capsule line packing",
          runMinutes: 600,
          setupMinutes: 40,
          wsCodes: ["BPD-089", "BPD-099", "BPD-009"],
        },
      ],
    },
    {
      sku: "AMOX-DPS-125",
      name: "Dry powder blend and DPS line",
      family: "BETA_LACTAM",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 320, setupMinutes: 45, wsCodes: ["BPD-062", "BPD-061"] },
        { code: "DPS", name: "DPS line", runMinutes: 900, setupMinutes: 60, wsCodes: ["DPS-LINE-1", "BPD-096"] },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 360, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 180, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        { code: "PACK", name: "Bulk packing", runMinutes: 480, setupMinutes: 30, wsCodes: ["BPD-009"] },
      ],
    },
  ];

  for (const template of templates) {
    const product = await prisma.product.findFirst({ where: { tenantId, sku: template.sku }, select: { id: true } });
    if (!product) continue;

    await prisma.productRouting.updateMany({ where: { tenantId, productId: product.id, active: true }, data: { active: false } });
    const version =
      ((
        await prisma.productRouting.findFirst({
          where: { tenantId, productId: product.id },
          orderBy: { version: "desc" },
          select: { version: true },
        })
      )?.version ?? 0) + 1;

    const routing = await prisma.productRouting.create({
      data: {
        tenantId,
        productId: product.id,
        name: template.name,
        version,
        active: true,
        operations: {
          create: template.steps.map((step, index) => ({
            tenantId,
            code: step.code,
            name: step.name,
            sequence: (index + 1) * 10,
            runMinutesPerBatch: step.runMinutes,
            setupMinutes: step.setupMinutes,
            teardownMinutes: 0,
            changeoverFamily: template.family,
            isQcHold: step.isQcHold ?? false,
            minCompletionPercent: 100,
            resources: {
              create: step.wsCodes.flatMap((code, resourceIndex) => {
                const workstationId = wsByCode.get(code);
                if (!workstationId) return [];
                return [
                  {
                    tenantId,
                    workstationId,
                    efficiencyPercent: resourceIndex === 0 ? 100 : 95,
                    preferred: resourceIndex === 0,
                  },
                ];
              }),
            },
          })),
        },
      },
      include: { operations: { orderBy: { sequence: "asc" } } },
    });

    if (routing.operations.length > 1) {
      await prisma.routingDependency.createMany({
        data: routing.operations.slice(1).map((operation, index) => ({
          tenantId,
          fromOperationId: routing.operations[index]!.id,
          toOperationId: operation.id,
          minimumLagMinutes: 0,
        })),
        skipDuplicates: true,
      });
    }
  }
}

async function linkLabAlliedOrdersToRoutings(prisma: PrismaClient, tenantId: string, wsByCode: Map<string, string>) {
  const products = await prisma.product.findMany({
    where: { tenantId, sku: { in: ["PARA-500-TAB", "AMOX-500-CAP", "AMOX-DPS-125"] } },
    select: { id: true },
  });
  for (const product of products) {
    const routing = await prisma.productRouting.findFirst({
      where: { tenantId, productId: product.id, active: true },
      include: { operations: { orderBy: { sequence: "asc" }, include: { resources: true } } },
    });
    if (!routing) continue;

    const orders = await prisma.productionOrder.findMany({
      where: { tenantId, productId: product.id },
      select: { id: true },
    });
    for (const order of orders) {
      for (const routeOp of routing.operations) {
        const existing = await prisma.productionOperation.findFirst({
          where: { tenantId, productionOrderId: order.id, operationCode: routeOp.code },
          select: { workstationId: true },
        });
        const resourceIds = new Set(routeOp.resources.map((row) => row.workstationId));
        const keepExisting =
          existing?.workstationId && resourceIds.has(existing.workstationId) ? existing.workstationId : null;
        const preferredWs =
          keepExisting ??
          routeOp.resources.find((row) => row.preferred)?.workstationId ??
          routeOp.resources[0]?.workstationId ??
          null;
        await prisma.productionOperation.updateMany({
          where: { tenantId, productionOrderId: order.id, operationCode: routeOp.code },
          data: {
            routingOperationId: routeOp.id,
            operationName: routeOp.name,
            workstationId: preferredWs,
          },
        });
      }
    }
  }
}

type SeedStep = { code: string; ws: string; mins: number; qc?: boolean };
type SeedOrder = {
  orderNumber: string;
  productId: string;
  batch: string;
  dueDays: number;
  priority: "HIGH" | "NORMAL" | "LOW";
  steps: SeedStep[];
};

const TABLET_PACK_LINES = ["BPD-090", "BPD-051", "CPD-010"] as const;
const TABLET_BLEND_LINES = ["BPD-061", "BPD-062"] as const;
const CAP_FILL_LINES = ["BPD-092", "BPD-036", "BPD-017"] as const;
const CAP_PACK_LINES = ["BPD-089", "BPD-099", "BPD-009"] as const;
const DPS_LINES = ["DPS-LINE-1", "BPD-096"] as const;

function tabletRoute(blendIdx: number, packIdx: number, scale: number): SeedStep[] {
  return [
    { code: "BLND", ws: TABLET_BLEND_LINES[blendIdx % TABLET_BLEND_LINES.length]!, mins: Math.round(280 * scale + 80) },
    { code: "COMP", ws: "BPD-075", mins: Math.round(600 * scale + 120) },
    { code: "QUAR", ws: "SFG-QUAR", mins: 420, qc: true },
    { code: "QC", ws: "QC-PROC", mins: 200, qc: true },
    { code: "PACK", ws: TABLET_PACK_LINES[packIdx % TABLET_PACK_LINES.length]!, mins: Math.round(640 * scale + 160) },
  ];
}

function capsuleRoute(fillIdx: number, packIdx: number, scale: number): SeedStep[] {
  return [
    { code: "BLND", ws: "BPD-062", mins: Math.round(260 * scale + 60) },
    { code: "ENC", ws: CAP_FILL_LINES[fillIdx % CAP_FILL_LINES.length]!, mins: Math.round(720 * scale + 180) },
    { code: "QUAR", ws: "SFG-QUAR", mins: 360, qc: true },
    { code: "QC", ws: "QC-PROC", mins: 180, qc: true },
    { code: "PACK", ws: CAP_PACK_LINES[packIdx % CAP_PACK_LINES.length]!, mins: Math.round(480 * scale + 120) },
  ];
}

function dpsRoute(lineIdx: number, scale: number): SeedStep[] {
  return [
    { code: "BLND", ws: TABLET_BLEND_LINES[lineIdx % 2]!, mins: Math.round(300 * scale + 40) },
    { code: "DPS", ws: DPS_LINES[lineIdx % DPS_LINES.length]!, mins: Math.round(780 * scale + 200) },
    { code: "QUAR", ws: "SFG-QUAR", mins: 360, qc: true },
    { code: "QC", ws: "QC-PROC", mins: 180, qc: true },
    { code: "PACK", ws: "BPD-009", mins: Math.round(400 * scale + 80) },
  ];
}

function buildBulkLabAlliedOrders(paraId: string, amoxId: string, dpsId: string): SeedOrder[] {
  const rows: SeedOrder[] = [];
  for (let n = 0; n < 32; n += 1) {
    const item = 13 + n;
    const orderNumber = `ORD${String(14 + n).padStart(3, "0")}-2026/${item}`;
    const dueDays = 2 + (n % 21);
    const scale = 0.85 + (n % 5) * 0.08;
    const kind = n % 6;
    let productId = paraId;
    let steps: SeedStep[];
    if (kind <= 2) {
      steps = tabletRoute(n, n + 1, scale);
    } else if (kind <= 4) {
      productId = amoxId;
      steps = capsuleRoute(n, n + 2, scale);
    } else {
      productId = dpsId;
      steps = dpsRoute(n, scale);
    }
    rows.push({
      orderNumber,
      productId,
      batch: `B-${String(100 + n).padStart(3, "0")}`,
      dueDays,
      priority: n % 9 === 0 ? "HIGH" : n % 7 === 0 ? "LOW" : "NORMAL",
      steps,
    });
  }
  return rows;
}

async function createLabAlliedOrder(
  prisma: PrismaClient,
  tenantId: string,
  wsByCode: Map<string, string>,
  row: SeedOrder,
  index: number
) {
  const order = await prisma.productionOrder.create({
    data: {
      tenantId,
      orderNumber: row.orderNumber,
      productId: row.productId,
      quantity: 6000 + (index % 12) * 750,
      priority: row.priority,
      status: "SCHEDULED",
      dueDate: daysFromNow(row.dueDays, 14),
      durationMinutes: row.steps.reduce((sum, step) => sum + step.mins, 0),
      isLocked: false,
    },
  });
  await prisma.productionBatch.create({
    data: { tenantId, productionOrderId: order.id, batchNumber: row.batch, plannedQuantity: order.quantity },
  });
  for (let s = 0; s < row.steps.length; s += 1) {
    const step = row.steps[s]!;
    const wsId = wsByCode.get(step.ws);
    if (!wsId) continue;
    const family =
      step.qc ? null : step.code === "ENC" || step.code === "DPS" ? "BETA_LACTAM" : "GENERAL_TABLET";
    await prisma.productionOperation.create({
      data: {
        tenantId,
        productionOrderId: order.id,
        operationCode: step.code,
        operationName: step.code,
        sequence: (s + 1) * 10,
        workstationId: wsId,
        durationMinutes: step.mins,
        setupMinutes: s === 0 ? 45 : 25,
        changeoverFamily: family,
        status: "SCHEDULED",
        isLocked: false,
      },
    });
  }
}

async function seedLabAlliedOrders(prisma: PrismaClient, tenantId: string, wsByCode: Map<string, string>) {
  const para = await prisma.product.findFirst({ where: { tenantId, sku: "PARA-500-TAB" }, select: { id: true } });
  const amox = await prisma.product.findFirst({ where: { tenantId, sku: "AMOX-500-CAP" }, select: { id: true } });
  const dps = await prisma.product.findFirst({ where: { tenantId, sku: "AMOX-DPS-125" }, select: { id: true } });
  if (!para || !amox || !dps) return;

  const orders: SeedOrder[] = [
    {
      orderNumber: "ORD010-2026/9",
      productId: para.id,
      batch: "B-024",
      dueDays: 14,
      priority: "HIGH",
      steps: [
        { code: "BLND", ws: "BPD-061", mins: 360 },
        { code: "COMP", ws: "BPD-075", mins: 720 },
        { code: "QUAR", ws: "SFG-QUAR", mins: 480, qc: true },
        { code: "QC", ws: "QC-PROC", mins: 240, qc: true },
        { code: "PACK", ws: "BPD-090", mins: 1350 },
      ],
    },
    {
      orderNumber: "ORD011-2026/10",
      productId: para.id,
      batch: "B-025",
      dueDays: 18,
      priority: "NORMAL",
      steps: [
        { code: "BLND", ws: "BPD-062", mins: 300 },
        { code: "COMP", ws: "BPD-075", mins: 660 },
        { code: "QUAR", ws: "SFG-QUAR", mins: 480, qc: true },
        { code: "QC", ws: "QC-PROC", mins: 240, qc: true },
        { code: "PACK", ws: "CPD-010", mins: 840 },
      ],
    },
    {
      orderNumber: "ORD012-2026/11",
      productId: amox.id,
      batch: "B-026",
      dueDays: 22,
      priority: "NORMAL",
      steps: [
        { code: "BLND", ws: "BPD-062", mins: 280 },
        { code: "ENC", ws: "BPD-092", mins: 900 },
        { code: "QUAR", ws: "SFG-QUAR", mins: 360, qc: true },
        { code: "QC", ws: "QC-PROC", mins: 180, qc: true },
        { code: "PACK", ws: "BPD-089", mins: 540 },
      ],
    },
    {
      orderNumber: "ORD013-2026/12",
      productId: dps.id,
      batch: "B-027",
      dueDays: 26,
      priority: "NORMAL",
      steps: dpsRoute(0, 1),
    },
    ...buildBulkLabAlliedOrders(para.id, amox.id, dps.id),
  ];

  for (let i = 0; i < orders.length; i += 1) {
    await createLabAlliedOrder(prisma, tenantId, wsByCode, orders[i]!, i);
  }

  await prisma.productionOrder.create({
    data: {
      tenantId,
      orderNumber: "PRP-2026-001",
      productId: amox.id,
      quantity: 10000,
      priority: "HIGH",
      status: "UNSCHEDULED",
      orderKind: "PROSPECT",
      dueDate: daysFromNow(28, 14),
      durationMinutes: 1200,
      isLocked: false,
    },
  });
}
