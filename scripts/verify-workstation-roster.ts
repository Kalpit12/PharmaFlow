import { PrismaClient } from "@prisma/client";

import { LAB_ALLIED_DEMO_SLUG } from "../src/lib/demo-tenant";
import { getWorkstationRosterSnapshot, mondayOfPlantWeek } from "../src/lib/server/workstation-roster";

async function main() {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: LAB_ALLIED_DEMO_SLUG } });
    if (!tenant) throw new Error("lab-allied-demo tenant missing");

    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, status: "ACTIVE" },
      select: { id: true, role: true },
    });
    if (!user) throw new Error("No active user on lab-allied-demo");

    const ctx = { tenantId: tenant.id, userId: user.id, role: user.role };
    const weekStart = mondayOfPlantWeek(new Date()).toISOString();
    const snapshot = await getWorkstationRosterSnapshot(ctx, weekStart);

    if (snapshot.workstations.length < 17) {
      throw new Error(`Expected 17 workstations, got ${snapshot.workstations.length}`);
    }
    if (snapshot.assignments.length < 50) {
      throw new Error(`Expected roster assignments, got ${snapshot.assignments.length}`);
    }
    if (snapshot.employees.length < 4) {
      throw new Error(`Expected operators, got ${snapshot.employees.length}`);
    }

    console.log(
      JSON.stringify(
        {
          week: snapshot.weekLabel,
          workstations: snapshot.workstations.length,
          assignments: snapshot.assignments.length,
          employees: snapshot.employees.length,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
