import { PrismaClient } from "@prisma/client";

import { LAB_ALLIED_DEMO_SLUG } from "../src/lib/demo-tenant";
import { acceptSchedulePlan, proposeRescheduleAll } from "../src/lib/server/aps-plan";
import { applyLabAlliedSteadyStateWip } from "../prisma/apply-lab-allied-steady-state-wip";
import { ensureLabAlliedDemoSeed } from "../prisma/seed-lab-allied-demo";
import { realignDemoScheduleToShifts } from "../prisma/realign-demo-schedule-to-shifts";
import { reconcileLabAlliedDueDatesWithPlanner } from "../prisma/reconcile-lab-allied-due-dates-with-planner";
import { syncLabAlliedDueDatesAfterSchedule } from "../prisma/sync-lab-allied-due-dates";
import { getOperationsGanttSnapshot } from "../src/lib/server/operations-gantt";

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
    const wip = await applyLabAlliedSteadyStateWip(prisma, tenant.id, user.id);
    const realigned = await realignDemoScheduleToShifts(prisma, tenant.id);
    const dueUpdates = await syncLabAlliedDueDatesAfterSchedule(prisma, tenant.id);
    const dueReconciled = await reconcileLabAlliedDueDatesWithPlanner(prisma, ctx);
    console.log(
      `[lab-allied-demo] Accepted plan v${proposal.version}; WIP ${wip.wipOrders} orders (${wip.runningTimers} timers); realigned ${realigned} ops; due dates ${dueUpdates} + planner reconcile ${dueReconciled}.`
    );

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
    console.log(`\n[summary] firm ops with plannedStart in the past (non-completed): ${lateOps}`);

    const gantt = await getOperationsGanttSnapshot(ctx, { zoom: "36h" });
    const errorRows = gantt.orderTableRows.filter((row) => row.tab === "error");
    const lateRows = gantt.orderTableRows.filter((row) => row.tab === "late");
    const runningBars = gantt.bars.filter((bar) => bar.tone === "running").length;
    console.log(
      `[summary] Gantt 36h — late rows: ${lateRows.length}, error rows: ${errorRows.length}, running bars: ${runningBars}, late orders: ${gantt.lateSummary.lateOrders}`
    );
    if (errorRows.length > 0) {
      const sample = errorRows.slice(0, 25);
      for (const row of sample) {
        console.log(`  [error] ${row.orderNumber} ${row.stepName}: ${row.reason ?? "unknown"}`);
      }
      throw new Error(`Gantt error tab must be empty after replan (got ${errorRows.length}).`);
    }
    if (gantt.lateSummary.lateOrders > 3) {
      throw new Error(`Expected ≤3 late orders after due-date sync (got ${gantt.lateSummary.lateOrders}).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
