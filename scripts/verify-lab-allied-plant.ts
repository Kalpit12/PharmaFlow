import { PrismaClient } from "@prisma/client";

import { LAB_ALLIED_DEMO_SLUG } from "../src/lib/demo-tenant";
import { ensureLabAlliedDemoSeed } from "../prisma/seed-lab-allied-demo";

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureLabAlliedDemoSeed(prisma);

    const tenant = await prisma.tenant.findUnique({ where: { slug: LAB_ALLIED_DEMO_SLUG } });
    if (!tenant) throw new Error(`Tenant ${LAB_ALLIED_DEMO_SLUG} missing after seed.`);

    const firmOrders = await prisma.productionOrder.count({
      where: { tenantId: tenant.id, orderKind: "FIRM" },
    });
    const prospects = await prisma.productionOrder.count({
      where: { tenantId: tenant.id, orderKind: "PROSPECT" },
    });

    const workstations = await prisma.workstation.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: [{ group: { code: "asc" } }, { name: "asc" }],
      select: { code: true, name: true, group: { select: { name: true } } },
    });

    const medicrest = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
    const medicrestCount = medicrest
      ? await prisma.workstation.count({ where: { tenantId: medicrest.id, active: true } })
      : 0;

    console.log(
      JSON.stringify(
        {
          tenant: LAB_ALLIED_DEMO_SLUG,
          tenantId: tenant.id,
          firmOrders,
          prospects,
          activeWorkstations: workstations.length,
          medicrestActiveWorkstationsUnchanged: medicrestCount,
          note: "Run db:seed:lab-allied:replan for APS schedule and precedence checks.",
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
