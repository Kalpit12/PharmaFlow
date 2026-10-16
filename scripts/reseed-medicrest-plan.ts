import { PrismaClient } from "@prisma/client";

import { DEMO_TENANT_SLUG } from "../src/lib/demo-tenant";
import { acceptSchedulePlan, proposeRescheduleAll } from "../src/lib/server/aps-plan";
import { realignDemoScheduleToShifts } from "../prisma/realign-demo-schedule-to-shifts";
import { applyPlantShiftTemplate } from "./apply-plant-shift-template";

async function main() {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: DEMO_TENANT_SLUG } });
    if (!tenant) throw new Error(`Tenant ${DEMO_TENANT_SLUG} not found — run main db seed first.`);

    const shiftResult = await applyPlantShiftTemplate(prisma, DEMO_TENANT_SLUG);
    console.log(JSON.stringify({ step: "shifts", ...shiftResult }));

    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, status: "ACTIVE" },
      select: { id: true, role: true },
    });
    if (!user) throw new Error("No active user on medicrest tenant.");

    const ctx = { tenantId: tenant.id, userId: user.id, role: user.role };
    const proposal = await proposeRescheduleAll(ctx, new Date().toISOString());
    if (!proposal.id) throw new Error("Reschedule all did not return a plan id.");
    await acceptSchedulePlan(ctx, proposal.id);
    let realigned = await realignDemoScheduleToShifts(prisma, tenant.id);
    realigned += await realignDemoScheduleToShifts(prisma, tenant.id);

    const lateOps = await prisma.productionOperation.count({
      where: {
        tenantId: tenant.id,
        plannedStart: { lt: new Date() },
        status: { not: "COMPLETED" },
        productionOrder: { orderKind: "FIRM" },
      },
    });

    console.log(
      JSON.stringify({
        tenant: DEMO_TENANT_SLUG,
        acceptedPlanVersion: proposal.version,
        realigned,
        firmOpsWithPastPlannedStart: lateOps,
      })
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
