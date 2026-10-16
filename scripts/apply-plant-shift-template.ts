import { PrismaClient } from "@prisma/client";

import { buildStandardPlantShiftRows } from "../src/lib/operations/plant-shift-template";
import { isElapsedOnlyWorkstation } from "../src/lib/operations/elapsed-workstation";
import { realignDemoScheduleToShifts } from "../prisma/realign-demo-schedule-to-shifts";

/** Re-apply 08:30–17:30 / 19:00–06:00 shifts on all active workstations for a tenant slug. */
export async function applyPlantShiftTemplate(prisma: PrismaClient, tenantSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`Tenant ${tenantSlug} not found`);

  const workstations = await prisma.workstation.findMany({
    where: { tenantId: tenant.id, active: true },
    select: { id: true, code: true },
  });

  const dayNight = buildStandardPlantShiftRows([1, 2, 3, 4, 5, 6]);
  const fullDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startMinute: 0,
    endMinute: 1_440,
  }));

  for (const ws of workstations) {
    await prisma.workstationShift.deleteMany({ where: { workstationId: ws.id } });
    const rows = isElapsedOnlyWorkstation(ws.code) ? fullDay : dayNight;
    await prisma.workstationShift.createMany({
      data: rows.map((row) => ({ tenantId: tenant.id, workstationId: ws.id, ...row })),
    });
  }

  const realigned = await realignDemoScheduleToShifts(prisma, tenant.id);
  return { tenantSlug, workstations: workstations.length, realigned };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const slug of ["lab-allied-demo", "medicrest"]) {
      const result = await applyPlantShiftTemplate(prisma, slug);
      console.log(JSON.stringify(result));
    }
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").includes("apply-plant-shift-template");
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
