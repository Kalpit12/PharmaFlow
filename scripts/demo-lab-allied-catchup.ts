import { PrismaClient } from "@prisma/client";

import { LAB_ALLIED_DEMO_SLUG } from "../src/lib/demo-tenant";
import { runLabAlliedDemoCatchup } from "../src/lib/server/lab-allied-demo-heartbeat";

async function main() {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: LAB_ALLIED_DEMO_SLUG } });
    if (!tenant) throw new Error(`Tenant ${LAB_ALLIED_DEMO_SLUG} not found.`);

    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, status: "ACTIVE" },
      select: { id: true, role: true },
    });
    if (!user) throw new Error("No active user on demo tenant.");

    const ticks = await runLabAlliedDemoCatchup(prisma, {
      tenantId: tenant.id,
      userId: user.id,
      role: user.role,
    });
    console.log(`[demo:lab-allied:catchup] Ran ${ticks} heartbeat tick(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
