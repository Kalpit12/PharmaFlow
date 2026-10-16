import { PrismaClient } from "@prisma/client";

import { LAB_ALLIED_DEMO_SLUG } from "../src/lib/demo-tenant";
import { acceptSchedulePlan, proposeRescheduleAll } from "../src/lib/server/aps-plan";
import { ensureLabAlliedDemoSeed } from "../prisma/seed-lab-allied-demo";
import { realignDemoScheduleToShifts } from "../prisma/realign-demo-schedule-to-shifts";

async function printOrderTimeline(prisma: PrismaClient, tenantId: string, orderNumber: string) {
  const order = await prisma.productionOrder.findFirst({
    where: { tenantId, orderNumber },
    select: { id: true, dueDate: true, status: true },
  });
  if (!order) {
    console.log(`[timeline] ${orderNumber}: not found`);
    return;
  }
  const steps = await prisma.productionOperation.findMany({
    where: { tenantId, productionOrderId: order.id },
    orderBy: { sequence: "asc" },
    include: { workstation: { select: { code: true, name: true } } },
  });
  console.log(`\n[timeline] ${orderNumber} due=${order.dueDate.toISOString()} status=${order.status}`);
  for (const step of steps) {
    console.log(
      `  ${String(step.sequence).padStart(3, " ")} ${step.operationCode.padEnd(5, " ")} ${step.workstation?.name ?? "?"}  ${step.plannedStart?.toISOString() ?? "—"} → ${step.plannedEnd?.toISOString() ?? "—"}`
    );
  }
  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1]!;
    const cur = steps[i]!;
    if (prev.plannedEnd && cur.plannedStart && cur.plannedStart.getTime() < prev.plannedEnd.getTime()) {
      throw new Error(
        `Precedence violation on ${orderNumber}: ${cur.operationCode} starts before ${prev.operationCode} ends`
      );
    }
  }
}

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
    if (!proposal.id) throw new Error("Reschedule all did not return a plan id.");
    await acceptSchedulePlan(ctx, proposal.id);
    const realigned = await realignDemoScheduleToShifts(prisma, tenant.id);
    console.log(`[lab-allied-demo] Accepted plan v${proposal.version}; realigned ${realigned} ops.`);

    await printOrderTimeline(prisma, tenant.id, "ORD011-2026/10");
    await printOrderTimeline(prisma, tenant.id, "ORD012-2026/11");

    const lateOps = await prisma.productionOperation.count({
      where: {
        tenantId: tenant.id,
        plannedStart: { lt: new Date() },
        status: { not: "COMPLETED" },
        productionOrder: { orderKind: "FIRM" },
      },
    });
    console.log(`\n[summary] firm ops with plannedStart in the past (should be 0): ${lateOps}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
