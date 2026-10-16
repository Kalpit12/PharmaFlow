import { PrismaClient } from "@prisma/client";

import { LAB_ALLIED_DEMO_SLUG } from "../src/lib/demo-tenant";
import { acceptSchedulePlan, proposeRescheduleAll } from "../src/lib/server/aps-plan";
import { ensureLabAlliedDemoSeed } from "../prisma/seed-lab-allied-demo";

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureLabAlliedDemoSeed(prisma);

    const tenant = await prisma.tenant.findUnique({ where: { slug: LAB_ALLIED_DEMO_SLUG } });
    if (!tenant) throw new Error(`Tenant ${LAB_ALLIED_DEMO_SLUG} missing after seed.`);

    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, status: "ACTIVE" },
      select: { id: true, role: true },
    });
    if (!user) throw new Error("No active user on lab-allied-demo tenant.");

    const ctx = { tenantId: tenant.id, userId: user.id, role: user.role };

    const proposal = await proposeRescheduleAll(ctx, new Date().toISOString());
    if (proposal.id) {
      await acceptSchedulePlan(ctx, proposal.id);
    }

    const workstations = await prisma.workstation.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: [{ group: { code: "asc" } }, { name: "asc" }],
      select: { code: true, name: true, group: { select: { name: true } } },
    });

    const medicrest = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
    const medicrestCount = medicrest
      ? await prisma.workstation.count({ where: { tenantId: medicrest.id, active: true } })
      : 0;

    const lateOps = await prisma.productionOperation.count({
      where: {
        tenantId: tenant.id,
        plannedEnd: { lt: new Date() },
        status: { not: "COMPLETED" },
      },
    });

    const ord010 = await prisma.productionOrder.findFirst({
      where: { tenantId: tenant.id, orderNumber: "ORD010-2026/F" },
      select: { id: true },
    });
    if (ord010) {
      const steps = await prisma.productionOperation.findMany({
        where: { tenantId: tenant.id, productionOrderId: ord010.id },
        orderBy: { sequence: "asc" },
        select: { operationCode: true, plannedStart: true, plannedEnd: true },
      });
      for (let i = 1; i < steps.length; i += 1) {
        const prev = steps[i - 1]!;
        const cur = steps[i]!;
        if (prev.plannedEnd && cur.plannedStart) {
          if (cur.plannedStart.getTime() < prev.plannedEnd.getTime()) {
            throw new Error(
              `Precedence violation: ${cur.operationCode} starts before ${prev.operationCode} ends on ORD010-2026/F`
            );
          }
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          tenant: LAB_ALLIED_DEMO_SLUG,
          tenantId: tenant.id,
          activeWorkstations: workstations.length,
          medicrestActiveWorkstationsUnchanged: medicrestCount,
          operationsPastPlannedEnd: lateOps,
          workstations: workstations.map((row) => ({
            code: row.code,
            name: row.name,
            group: row.group?.name ?? null,
          })),
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
