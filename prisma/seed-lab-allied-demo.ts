import type { PrismaClient } from "@prisma/client";

import {
  LAB_ALLIED_DEMO_EMAIL,
  LAB_ALLIED_DEMO_LEGAL_NAME,
  LAB_ALLIED_DEMO_SLUG,
} from "../src/lib/demo-tenant";
import { hashPassword } from "../src/lib/server/password";
import { addPlantDays, plantWeekday, plantYmd, startOfPlantDay } from "../src/lib/operations/plant-time";
import {
  PLANT_CAPACITY_HOURS_PER_DAY,
  buildStandardPlantShiftRows,
} from "../src/lib/operations/plant-shift-template";
import {
  LAB_ALLIED_OPERATORS,
  assignOperatorForSlot,
  registerRosterEmployees,
  resetRosterAssignmentLoads,
  resetRosterSlotLoads,
} from "../src/lib/operations/lab-allied-roster-staffing";
import { rosterBandsForWorkstation } from "../src/lib/operations/roster-shift-bands";
import {
  PLANT_DAY_SHIFT_END,
  PLANT_DAY_SHIFT_START,
  PLANT_NIGHT_SHIFT_END,
  PLANT_NIGHT_SHIFT_START,
} from "../src/lib/operations/plant-shift-template";
import { mondayOfPlantWeek } from "../src/lib/server/workstation-roster";

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
  { code: "LA-PACK", name: "Packing lines" },
  { code: "LA-LINE", name: "Line" },
  { code: "LA-QUAR", name: "Quarantine" },
  { code: "LA-QC", name: "QC" },
];

const MACHINES: MachineDef[] = [
  { code: "BPD-061", name: "Blender octagonal 1000kg", groupCode: "LA-BLEND", shift: "plant" },
  { code: "BPD-062", name: "LabClav Blending 500kg", groupCode: "LA-BLEND", shift: "plant" },
  { code: "BPD-076", name: "Tablet Press (General)", groupCode: "LA-COMP", shift: "plant" },
  { code: "BPD-075", name: "LabClav Compression", groupCode: "LA-COMP", shift: "plant" },
  { code: "BPD-078", name: "ACG Coating", groupCode: "LA-COAT", shift: "plant" },
  { code: "BPD-092", name: "Capsule Filling-ACG", groupCode: "LA-FILL", shift: "plant" },
  { code: "BPD-036", name: "Capsule Filling-Chinese", groupCode: "LA-FILL", shift: "plant" },
  { code: "BPD-017", name: "Capsule Filling Small Batch", groupCode: "LA-FILL", shift: "plant" },
  { code: "BPD-090", name: "ACG Blister Tablet Packing", groupCode: "LA-BLISTER", shift: "plant" },
  { code: "BPD-051", name: "Blister Packing Alu/Alu Lablas", groupCode: "LA-BLISTER", shift: "plant" },
  { code: "CPD-010", name: "Blister Machine-BMAX", groupCode: "LA-BLISTER", shift: "plant" },
  { code: "BPD-089", name: "Capsule Line Packing", groupCode: "LA-PACK", shift: "plant" },
  { code: "BPD-099", name: "Capsules Line packing II", groupCode: "LA-PACK", shift: "plant" },
  { code: "BPD-009", name: "Bulk (counting) Packing", groupCode: "LA-PACK", shift: "plant" },
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
    create: {
      tenantId: tenant.id,
      autopilotMode: "AUTO_ACCEPT_UNLOCKED",
      freezeMinutes: 0,
      utilizationWeight: 45,
      useGlobalOptimizer: true,
    },
    update: { autopilotMode: "AUTO_ACCEPT_UNLOCKED", freezeMinutes: 0, utilizationWeight: 45 },
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
        capacityHoursPerDay: machine.shift === "qc24" ? 24 : Math.round(PLANT_CAPACITY_HOURS_PER_DAY),
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
        capacityHoursPerDay: machine.shift === "qc24" ? 24 : Math.round(PLANT_CAPACITY_HOURS_PER_DAY),
      },
    });
    wsByCode.set(machine.code, row.id);
    await applyPlantShifts(prisma, tenant.id, row.id, machine.shift);
    const parallelJobs =
      machine.code === "SFG-QUAR" ? 999 : machine.code === "QC-PROC" ? 4 : machine.shift === "qc24" ? 4 : 1;
    await prisma.workstation.update({
      where: { id: row.id },
      data: { allowedParallelJobs: parallelJobs },
    });
  }

  await prisma.workstation.updateMany({
    where: { tenantId: tenant.id, code: { in: ["BPD-062", "BPD-075"] } },
    data: { dedicatedTo: "BETA_LACTAM" },
  });
  await prisma.workstation.updateMany({
    where: { tenantId: tenant.id, code: { in: ["BPD-061", "BPD-076"] } },
    data: { dedicatedTo: "GENERAL_ONLY" },
  });

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
    {
      sku: "PARA-500-FC",
      name: "Paracetamol 500mg film-coated",
      category: "Analgesic",
      dosageForm: "Film-coated tablet",
      validatedBatchSize: 7500,
    },
    {
      sku: "IBU-400-TAB",
      name: "Ibuprofen 400mg",
      category: "NSAID",
      dosageForm: "Tablet",
      validatedBatchSize: 9000,
    },
    {
      sku: "MET-500-TAB",
      name: "Metformin 500mg",
      category: "Antidiabetic",
      dosageForm: "Tablet",
      validatedBatchSize: 10000,
    },
    {
      sku: "CIP-250-TAB",
      name: "Ciprofloxacin 250mg",
      category: "Antibiotic",
      dosageForm: "Tablet",
      validatedBatchSize: 8000,
    },
    {
      sku: "VIT-C-1000",
      name: "Vitamin C 1000mg effervescent",
      category: "Supplement",
      dosageForm: "Effervescent tablet",
      validatedBatchSize: 5000,
    },
    {
      sku: "COAMOX-625-TAB",
      name: "Co-amoxiclav 625mg tablets",
      category: "Antibiotic",
      dosageForm: "Tablet",
      validatedBatchSize: 8500,
    },
    {
      sku: "PARA-500-JAR1000",
      name: "Paracetamol 500mg — hospital jar ×1000",
      category: "Analgesic",
      dosageForm: "Tablet",
      validatedBatchSize: 8000,
    },
    {
      sku: "AMOX-500-JAR500",
      name: "Amoxicillin 500mg — hospital jar ×500",
      category: "Antibiotic",
      dosageForm: "Capsule",
      validatedBatchSize: 10000,
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
        hazardClass: row.sku.startsWith("AMOX") || row.sku.startsWith("COAMOX") ? "BETA_LACTAM" : "GENERAL",
        description: "Demo SKU for scheduling layout only.",
      },
      update: {
        name: row.name,
        validatedBatchSize: row.validatedBatchSize,
        status: "ACTIVE",
        hazardClass: row.sku.startsWith("AMOX") || row.sku.startsWith("COAMOX") ? "BETA_LACTAM" : "GENERAL",
      },
    });
  }

  await prisma.product.updateMany({
    where: { tenantId: tenant.id, sku: "COUGH-SYR-100" },
    data: { status: "DISCONTINUED" },
  });

  await syncLabAlliedRoutings(prisma, tenant.id, wsByCode);
  await syncLabAlliedChangeovers(prisma, tenant.id, wsByCode);
  await verifyLabAlliedTabletCompression(prisma, tenant.id);

  await prisma.schedulePlanOperation.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.schedulePlanOrder.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.schedulePlan.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.productionOperation.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.productionBatch.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.productionOrder.deleteMany({ where: { tenantId: tenant.id } });

  const customerIds = await ensureLabAlliedCustomers(prisma, tenant.id);
  await seedLabAlliedOrders(prisma, tenant.id, wsByCode, customerIds);
  await linkLabAlliedOrdersToRoutings(prisma, tenant.id, wsByCode);
  const { seedLabAlliedAwaitingPackingWip } = await import("./seed-lab-allied-packing-wip");
  await seedLabAlliedAwaitingPackingWip(prisma, tenant.id, wsByCode, customerIds);
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
  for (const row of LAB_ALLIED_OPERATORS) {
    await prisma.plantEmployee.upsert({
      where: { tenantId_code: { tenantId, code: row.code } },
      create: { tenantId, departmentId, code: row.code, name: row.name, status: "ACTIVE" },
      update: { name: row.name, status: "ACTIVE", departmentId },
    });
  }

  await prisma.plantEmployee.updateMany({
    where: { tenantId, code: { notIn: LAB_ALLIED_OPERATORS.map((row) => row.code) } },
    data: { status: "INACTIVE" },
  });
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
    include: { shifts: true, group: { select: { code: true } } },
  });

  const weekStart = mondayOfPlantWeek(startOfPlantDay(new Date()));
  const rows: Array<{
    tenantId: string;
    workstationId: string;
    date: Date;
    startMinute: number;
    endMinute: number;
    employeeId: string;
    shiftLabel: string;
  }> = [];

  registerRosterEmployees(employees.map((row) => ({ id: row.id, code: row.code, name: row.name })));
  resetRosterAssignmentLoads();

  for (let offset = -7 * 12; offset <= 7 * 16; offset += 1) {
    const day = addPlantDays(weekStart, offset);
    const weekday = plantWeekday(day);
    const ymd = plantYmd(day);
    const [y, m, d] = ymd.split("-").map(Number);
    const dateOnly = new Date(Date.UTC(y!, m! - 1, d!));

    resetRosterSlotLoads();
    const sortedWs = [...workstations].sort((a, b) => a.code.localeCompare(b.code));
    for (const ws of sortedWs) {
      const bands = rosterBandsForWorkstation(ws.shifts, weekday);
      for (const band of bands) {
        const employee = assignOperatorForSlot({
          dateYmd: ymd,
          shiftLabel: band.shiftLabel,
          startMinute: band.startMinute,
          endMinute: band.endMinute,
          groupCode: ws.group?.code ?? null,
          workstationCode: ws.code,
        });
        if (!employee) continue;
        let startMinute = band.startMinute;
        let endMinute = band.endMinute;
        if (band.shiftLabel === "Day") {
          startMinute = PLANT_DAY_SHIFT_START;
          endMinute = PLANT_DAY_SHIFT_END;
        } else if (band.shiftLabel === "Night") {
          startMinute = PLANT_NIGHT_SHIFT_START;
          endMinute = 1_440 + PLANT_NIGHT_SHIFT_END;
        }
        rows.push({
          tenantId,
          workstationId: ws.id,
          date: dateOnly,
          startMinute,
          endMinute,
          employeeId: employee.id,
          shiftLabel: band.shiftLabel,
        });
      }
    }
  }

  for (let i = 0; i < rows.length; i += 100) {
    await prisma.workstationRosterAssignment.createMany({ data: rows.slice(i, i + 100) });
  }
}

async function syncLabAlliedChangeovers(prisma: PrismaClient, tenantId: string, wsByCode: Map<string, string>) {
  const globalRules = [
    {
      workstationId: null as string | null,
      fromFamily: "GENERAL_TABLET",
      toFamily: "BETA_LACTAM",
      durationMinutes: 120,
      level: "MAJOR" as const,
      maxCampaignBatches: null as number | null,
    },
    {
      workstationId: null,
      fromFamily: "BETA_LACTAM",
      toFamily: "GENERAL_TABLET",
      durationMinutes: 240,
      level: "MAJOR" as const,
      maxCampaignBatches: null,
    },
    {
      workstationId: null,
      fromFamily: "GENERAL_TABLET",
      toFamily: "GENERAL_TABLET",
      durationMinutes: 45,
      level: "MINOR" as const,
      maxCampaignBatches: 6,
    },
    {
      workstationId: null,
      fromFamily: "BETA_LACTAM",
      toFamily: "BETA_LACTAM",
      durationMinutes: 60,
      level: "MINOR" as const,
      maxCampaignBatches: 4,
    },
  ];

  for (const rule of globalRules) {
    const existing = await prisma.changeoverRule.findFirst({
      where: {
        tenantId,
        workstationId: rule.workstationId,
        fromFamily: rule.fromFamily,
        toFamily: rule.toFamily,
      },
    });
    if (!existing) {
      await prisma.changeoverRule.create({ data: { tenantId, ...rule } });
    }
  }

  const blisterId = wsByCode.get("BPD-090");
  if (blisterId) {
    await prisma.changeoverRule.upsert({
      where: {
        tenantId_workstationId_fromFamily_toFamily: {
          tenantId,
          workstationId: blisterId,
          fromFamily: "GENERAL_TABLET",
          toFamily: "GENERAL_TABLET",
        },
      },
      create: {
        tenantId,
        workstationId: blisterId,
        fromFamily: "GENERAL_TABLET",
        toFamily: "GENERAL_TABLET",
        durationMinutes: 75,
        level: "MINOR",
        maxCampaignBatches: 5,
      },
      update: { durationMinutes: 75, level: "MINOR", maxCampaignBatches: 5 },
    });
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
        { code: "BLND", name: "Blending", runMinutes: 360, setupMinutes: 45, wsCodes: ["BPD-061"] },
        { code: "COMP", name: "Compression", runMinutes: 680, setupMinutes: 60, wsCodes: ["BPD-076"] },
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
          wsCodes: ["BPD-089", "BPD-099"],
        },
      ],
    },
    {
      sku: "AMOX-DPS-125",
      name: "Dry powder blend and DPS line",
      family: "BETA_LACTAM",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 320, setupMinutes: 45, wsCodes: ["BPD-062"] },
        { code: "DPS", name: "DPS line", runMinutes: 900, setupMinutes: 60, wsCodes: ["DPS-LINE-1", "BPD-096"] },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 360, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 180, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        { code: "PACK", name: "Bulk packing", runMinutes: 480, setupMinutes: 30, wsCodes: ["BPD-009"] },
      ],
    },
    {
      sku: "PARA-500-FC",
      name: "Film coat, Alu/Alu blister",
      family: "GENERAL_TABLET",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 340, setupMinutes: 45, wsCodes: ["BPD-061"] },
        { code: "COMP", name: "Compression", runMinutes: 660, setupMinutes: 60, wsCodes: ["BPD-076"] },
        { code: "COAT", name: "Film coating", runMinutes: 540, setupMinutes: 90, wsCodes: ["BPD-078"] },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 480, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 240, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        {
          code: "PACK",
          name: "Alu/Alu blister",
          runMinutes: 960,
          setupMinutes: 45,
          wsCodes: ["BPD-051", "BPD-090"],
        },
      ],
    },
    {
      sku: "IBU-400-TAB",
      name: "Ibuprofen 400mg film-coated blister",
      family: "GENERAL_TABLET",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 320, setupMinutes: 45, wsCodes: ["BPD-061"] },
        { code: "COMP", name: "Compression", runMinutes: 640, setupMinutes: 55, wsCodes: ["BPD-076"] },
        { code: "COAT", name: "Film coating", runMinutes: 520, setupMinutes: 85, wsCodes: ["BPD-078"] },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 420, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 200, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        { code: "PACK", name: "Blister packing", runMinutes: 880, setupMinutes: 40, wsCodes: ["CPD-010", "BPD-090"] },
      ],
    },
    {
      sku: "MET-500-TAB",
      name: "Metformin 500mg film-coated blister",
      family: "GENERAL_TABLET",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 300, setupMinutes: 40, wsCodes: ["BPD-061"] },
        { code: "COMP", name: "Compression", runMinutes: 620, setupMinutes: 50, wsCodes: ["BPD-076"] },
        { code: "COAT", name: "Film coating", runMinutes: 500, setupMinutes: 80, wsCodes: ["BPD-078"] },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 400, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 180, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        { code: "PACK", name: "Alu/Alu blister", runMinutes: 760, setupMinutes: 40, wsCodes: ["BPD-051", "BPD-090"] },
      ],
    },
    {
      sku: "CIP-250-TAB",
      name: "Ciprofloxacin tablet",
      family: "GENERAL_TABLET",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 310, setupMinutes: 45, wsCodes: ["BPD-061"] },
        { code: "COMP", name: "Compression", runMinutes: 600, setupMinutes: 55, wsCodes: ["BPD-076"] },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 420, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 220, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        { code: "PACK", name: "Blister packing", runMinutes: 760, setupMinutes: 40, wsCodes: ["BPD-051"] },
      ],
    },
    {
      sku: "VIT-C-1000",
      name: "Effervescent bulk pack",
      family: "GENERAL_TABLET",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 280, setupMinutes: 35, wsCodes: ["BPD-061"] },
        { code: "COMP", name: "Compression", runMinutes: 480, setupMinutes: 45, wsCodes: ["BPD-076"] },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 360, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 160, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        { code: "PACK", name: "Bulk packing", runMinutes: 440, setupMinutes: 25, wsCodes: ["BPD-009"] },
      ],
    },
    {
      sku: "PARA-500-JAR1000",
      name: "Hospital bulk jar pack (paracetamol)",
      family: "GENERAL_TABLET",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 340, setupMinutes: 45, wsCodes: ["BPD-061"] },
        { code: "COMP", name: "Compression", runMinutes: 640, setupMinutes: 55, wsCodes: ["BPD-076"] },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 420, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 200, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        { code: "PACK", name: "Bulk (counting) packing", runMinutes: 720, setupMinutes: 35, wsCodes: ["BPD-009"] },
      ],
    },
    {
      sku: "AMOX-500-JAR500",
      name: "Hospital bulk jar pack (amoxicillin)",
      family: "BETA_LACTAM",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 280, setupMinutes: 45, wsCodes: ["BPD-062"] },
        { code: "ENC", name: "Capsule filling", runMinutes: 780, setupMinutes: 85, wsCodes: ["BPD-092", "BPD-036"] },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 360, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 180, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        { code: "PACK", name: "Bulk (counting) packing", runMinutes: 660, setupMinutes: 30, wsCodes: ["BPD-009"] },
      ],
    },
    {
      sku: "COAMOX-625-TAB",
      name: "Co-amoxiclav tablet (LabClav)",
      family: "BETA_LACTAM",
      steps: [
        { code: "BLND", name: "Blending", runMinutes: 300, setupMinutes: 45, wsCodes: ["BPD-062"] },
        { code: "COMP", name: "Compression", runMinutes: 720, setupMinutes: 75, wsCodes: ["BPD-075"] },
        { code: "QUAR", name: "sFG quarantine", runMinutes: 420, setupMinutes: 0, wsCodes: ["SFG-QUAR"], isQcHold: true },
        { code: "QC", name: "QC process", runMinutes: 200, setupMinutes: 0, wsCodes: ["QC-PROC"], isQcHold: true },
        {
          code: "PACK",
          name: "Alu/Alu blister",
          runMinutes: 880,
          setupMinutes: 45,
          wsCodes: ["BPD-051"],
        },
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
                    resourceRole: resourceIndex === 0 ? "STANDARD" : "ALTERNATE",
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

async function linkLabAlliedOrdersToRoutings(prisma: PrismaClient, tenantId: string, _wsByCode: Map<string, string>) {
  const products = await prisma.product.findMany({
    where: { tenantId, status: "ACTIVE" },
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
        await prisma.productionOperation.updateMany({
          where: { tenantId, productionOrderId: order.id, operationCode: routeOp.code },
          data: {
            routingOperationId: routeOp.id,
            operationName: routeOp.name,
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
  customerId?: string;
  batch: string;
  dueDays: number;
  priority: "HIGH" | "NORMAL" | "LOW";
  steps: SeedStep[];
};

const LAB_ALLIED_CUSTOMERS = [
  { name: "Nairobi Central Hospital", type: "HOSPITAL" as const },
  { name: "Kenya Pharma Distributors Ltd", type: "DISTRIBUTOR" as const },
  { name: "Mombasa County Referral", type: "HOSPITAL" as const },
  { name: "East Africa MedSupply", type: "DISTRIBUTOR" as const },
  { name: "Kisumu Faith Community Pharmacy", type: "PHARMACY" as const },
  { name: "Coast General Hospital", type: "HOSPITAL" as const },
];

async function ensureLabAlliedCustomers(prisma: PrismaClient, tenantId: string): Promise<string[]> {
  const ids: string[] = [];
  for (const row of LAB_ALLIED_CUSTOMERS) {
    const existing = await prisma.customer.findFirst({
      where: { tenantId, name: row.name },
      select: { id: true },
    });
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const created = await prisma.customer.create({
      data: { tenantId, name: row.name, type: row.type, status: "ACTIVE" },
    });
    ids.push(created.id);
  }
  return ids;
}

/** Fail replan if any active tablet routing lacks a compression step. */
export async function verifyLabAlliedTabletCompression(prisma: PrismaClient, tenantId: string): Promise<void> {
  const tabletProducts = await prisma.product.findMany({
    where: { tenantId, dosageForm: { contains: "Tablet", mode: "insensitive" } },
    select: { sku: true, id: true },
  });
  for (const product of tabletProducts) {
    const routing = await prisma.productRouting.findFirst({
      where: { tenantId, productId: product.id, active: true },
      include: { operations: { select: { code: true } } },
    });
    if (!routing) continue;
    const hasComp = routing.operations.some((op) => op.code === "COMP" || op.code === "ENC");
    if (!hasComp) {
      throw new Error(`Tablet product ${product.sku} active routing has no compression step (COMP).`);
    }
  }
}

const TABLET_PACK_LINES = ["BPD-090", "CPD-010", "BPD-051"] as const;
const GENERAL_BLEND = "BPD-061" as const;
const BETA_BLEND = "BPD-062" as const;
const BETA_COMP = "BPD-075" as const;
const COAT_LINE = "BPD-078" as const;
const CAP_FILL_LINES = ["BPD-092", "BPD-036", "BPD-017"] as const;
const CAP_PACK_LINES = ["BPD-089", "BPD-099"] as const;
const DPS_LINES = ["DPS-LINE-1", "BPD-096"] as const;

const GENERAL_COMP = "BPD-076" as const;

function tabletRoutePara(_blendIdx: number, packIdx: number, scale: number): SeedStep[] {
  return [
    { code: "BLND", ws: "BPD-061", mins: Math.round(280 * scale + 80) },
    { code: "COMP", ws: GENERAL_COMP, mins: Math.round(520 * scale + 100) },
    { code: "QUAR", ws: "SFG-QUAR", mins: 360, qc: true },
    { code: "QC", ws: "QC-PROC", mins: 180, qc: true },
    { code: "PACK", ws: TABLET_PACK_LINES[packIdx % TABLET_PACK_LINES.length]!, mins: Math.round(640 * scale + 160) },
  ];
}

function filmCoatRoute(packIdx: number, scale: number): SeedStep[] {
  return [
    { code: "BLND", ws: GENERAL_BLEND, mins: Math.round(280 * scale + 80) },
    { code: "COMP", ws: GENERAL_COMP, mins: Math.round(520 * scale + 100) },
    { code: "COAT", ws: COAT_LINE, mins: Math.round(480 * scale + 120) },
    { code: "QUAR", ws: "SFG-QUAR", mins: 420, qc: true },
    { code: "QC", ws: "QC-PROC", mins: 200, qc: true },
    { code: "PACK", ws: TABLET_PACK_LINES[packIdx % TABLET_PACK_LINES.length]!, mins: Math.round(640 * scale + 160) },
  ];
}

function coAmoxTabletRoute(packIdx: number, scale: number): SeedStep[] {
  return [
    { code: "BLND", ws: BETA_BLEND, mins: Math.round(260 * scale + 70) },
    { code: "COMP", ws: BETA_COMP, mins: Math.round(560 * scale + 140) },
    { code: "QUAR", ws: "SFG-QUAR", mins: 400, qc: true },
    { code: "QC", ws: "QC-PROC", mins: 190, qc: true },
    { code: "PACK", ws: "BPD-051", mins: Math.round(620 * scale + 150) },
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
    { code: "BLND", ws: BETA_BLEND, mins: Math.round(300 * scale + 40) },
    { code: "DPS", ws: DPS_LINES[lineIdx % DPS_LINES.length]!, mins: Math.round(780 * scale + 200) },
    { code: "QUAR", ws: "SFG-QUAR", mins: 360, qc: true },
    { code: "QC", ws: "QC-PROC", mins: 180, qc: true },
    { code: "PACK", ws: "BPD-009", mins: Math.round(400 * scale + 80) },
  ];
}

function buildBulkLabAlliedOrders(
  paraId: string,
  ibuId: string,
  metId: string,
  coAmoxId: string,
  amoxId: string,
  dpsId: string,
  customerIds: string[]
): SeedOrder[] {
  const rows: SeedOrder[] = [];
  for (let n = 0; n < 42; n += 1) {
    const item = 13 + n;
    const orderNumber = `ORD${String(14 + n).padStart(3, "0")}-2026/${item}`;
    const dueDays = 8 + (n % 21);
    const scale = 0.85 + (n % 5) * 0.08;
    const kind = n % 12;
    let productId = paraId;
    let steps: SeedStep[];
    if (kind <= 2) {
      steps = tabletRoutePara(n, n, scale);
    } else if (kind === 3 || kind === 4) {
      productId = ibuId;
      steps = filmCoatRoute(n, scale);
    } else if (kind === 5 || kind === 6) {
      productId = metId;
      steps = filmCoatRoute(n + 1, scale);
    } else if (kind === 7 || kind === 8) {
      productId = coAmoxId;
      steps = coAmoxTabletRoute(n, scale);
    } else if (kind <= 10) {
      productId = amoxId;
      steps = capsuleRoute(n, n + 2, scale);
    } else {
      productId = dpsId;
      steps = dpsRoute(n, scale);
    }
    rows.push({
      orderNumber,
      productId,
      customerId: customerIds[n % customerIds.length],
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
      customerId: row.customerId,
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
    const family = step.qc
      ? null
      : step.code === "ENC" ||
          step.code === "DPS" ||
          step.ws === BETA_BLEND ||
          step.ws === BETA_COMP
        ? "BETA_LACTAM"
        : "GENERAL_TABLET";
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

async function seedLabAlliedOrders(
  prisma: PrismaClient,
  tenantId: string,
  wsByCode: Map<string, string>,
  customerIds: string[]
) {
  const para = await prisma.product.findFirst({ where: { tenantId, sku: "PARA-500-TAB" }, select: { id: true } });
  const ibu = await prisma.product.findFirst({ where: { tenantId, sku: "IBU-400-TAB" }, select: { id: true } });
  const met = await prisma.product.findFirst({ where: { tenantId, sku: "MET-500-TAB" }, select: { id: true } });
  const coAmox = await prisma.product.findFirst({ where: { tenantId, sku: "COAMOX-625-TAB" }, select: { id: true } });
  const amox = await prisma.product.findFirst({ where: { tenantId, sku: "AMOX-500-CAP" }, select: { id: true } });
  const dps = await prisma.product.findFirst({ where: { tenantId, sku: "AMOX-DPS-125" }, select: { id: true } });
  const paraJar = await prisma.product.findFirst({ where: { tenantId, sku: "PARA-500-JAR1000" }, select: { id: true } });
  const amoxJar = await prisma.product.findFirst({ where: { tenantId, sku: "AMOX-500-JAR500" }, select: { id: true } });
  if (!para || !ibu || !met || !coAmox || !amox || !dps) return;

  const orders: SeedOrder[] = [
    {
      orderNumber: "ORD010-2026/9",
      productId: para.id,
      batch: "B-024",
      dueDays: 14,
      priority: "HIGH",
      customerId: customerIds[0],
      steps: [
        { code: "BLND", ws: "BPD-061", mins: 360 },
        { code: "COMP", ws: GENERAL_COMP, mins: 620 },
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
      customerId: customerIds[1],
      steps: [
        { code: "BLND", ws: "BPD-061", mins: 300 },
        { code: "COMP", ws: GENERAL_COMP, mins: 580 },
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
    ...(paraJar
      ? [
          {
            orderNumber: "ORD-JAR-2026/01",
            productId: paraJar.id,
            batch: "B-JAR-01",
            dueDays: 21,
            priority: "HIGH" as const,
            customerId: customerIds[0],
            steps: [
              { code: "BLND", ws: "BPD-061", mins: 340 },
              { code: "COMP", ws: GENERAL_COMP, mins: 600 },
              { code: "QUAR", ws: "SFG-QUAR", mins: 420, qc: true },
              { code: "QC", ws: "QC-PROC", mins: 200, qc: true },
              { code: "PACK", ws: "BPD-009", mins: 720 },
            ],
          },
        ]
      : []),
    ...(amoxJar
      ? [
          {
            orderNumber: "ORD-JAR-2026/02",
            productId: amoxJar.id,
            batch: "B-JAR-02",
            dueDays: 24,
            priority: "HIGH" as const,
            customerId: customerIds[0],
            steps: [
              { code: "BLND", ws: "BPD-062", mins: 280 },
              { code: "ENC", ws: "BPD-092", mins: 760 },
              { code: "QUAR", ws: "SFG-QUAR", mins: 360, qc: true },
              { code: "QC", ws: "QC-PROC", mins: 180, qc: true },
              { code: "PACK", ws: "BPD-009", mins: 660 },
            ],
          },
        ]
      : []),
    ...buildBulkLabAlliedOrders(para.id, ibu.id, met.id, coAmox.id, amox.id, dps.id, customerIds),
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
