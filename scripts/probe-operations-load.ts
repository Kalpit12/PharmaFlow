import { PrismaClient } from "@prisma/client";

import { LAB_ALLIED_DEMO_SLUG } from "../src/lib/demo-tenant";
import { getOperationsGanttSnapshot } from "../src/lib/server/operations-gantt";
import { getPlantModelSnapshot } from "../src/lib/server/plant-model";

async function main() {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: LAB_ALLIED_DEMO_SLUG } });
    if (!tenant) throw new Error("lab-allied-demo tenant missing");
    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, status: "ACTIVE" },
      select: { id: true, role: true },
    });
    if (!user) throw new Error("no active user");
    const ctx = { tenantId: tenant.id, userId: user.id, role: user.role };

    console.log("Probing schema columns…");
    await prisma.$queryRaw`SELECT "hazardClass" FROM "Product" LIMIT 1`;
    await prisma.$queryRaw`SELECT "dedicatedTo" FROM "Workstation" LIMIT 1`;
    await prisma.workstationRosterAssignment.findFirst({ where: { tenantId: tenant.id } });
    console.log("Schema OK");

    console.log("Loading plant…");
    await getPlantModelSnapshot(ctx);
    console.log("Loading gantt…");
    const gantt = await getOperationsGanttSnapshot(ctx, { zoom: "36h" });
    console.log(
      `Gantt OK — bars: ${gantt.bars.length}, errors: ${gantt.orderTableRows.filter((r) => r.tab === "error").length}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("PROBE FAILED:", error);
  process.exit(1);
});
