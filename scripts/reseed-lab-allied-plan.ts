import { PrismaClient } from "@prisma/client";

import { LAB_ALLIED_DEMO_SLUG } from "../src/lib/demo-tenant";
import { acceptSchedulePlan, proposeRescheduleAll } from "../src/lib/server/aps-plan";
import { applyLabAlliedSteadyStateWip } from "../prisma/apply-lab-allied-steady-state-wip";
import { ensureLabAlliedDemoSeed, verifyLabAlliedTabletCompression } from "../prisma/seed-lab-allied-demo";
import { realignDemoScheduleToShifts } from "../prisma/realign-demo-schedule-to-shifts";
import { reconcileLabAlliedDueDatesWithPlanner } from "../prisma/reconcile-lab-allied-due-dates-with-planner";
import { syncLabAlliedDueDatesAfterSchedule } from "../prisma/sync-lab-allied-due-dates";
import { seedLabAlliedLateDemoOrders } from "../prisma/seed-lab-allied-late-demo";
import { seedLabAlliedShopFloorHistory } from "../prisma/seed-lab-allied-shop-floor-history";
import { bumpPastScheduledStarts } from "../prisma/bump-past-scheduled-starts";
import { syncLabAlliedOrderWorkstations } from "../prisma/sync-lab-allied-order-workstations";
import { getOperationsGanttSnapshot } from "../src/lib/server/operations-gantt";
import { getProductionExecutionSnapshot } from "../src/lib/server/production-execution";
import { printLabAlliedUtilizationTable } from "./lab-allied-utilization-report";
import { printLabAlliedRosterWarnings } from "./list-lab-allied-roster-warnings";

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
    await verifyLabAlliedTabletCompression(prisma, tenant.id);

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
    const rollup = await syncLabAlliedOrderWorkstations(prisma, tenant.id);
    const historyEvents = await seedLabAlliedShopFloorHistory(prisma, tenant.id, user.id);
    const bumped = await bumpPastScheduledStarts(prisma, tenant.id);
    await syncLabAlliedOrderWorkstations(prisma, tenant.id);
    console.log(
      `[lab-allied-demo] Accepted plan v${proposal.version}; WIP ${wip.wipOrders} orders (${wip.runningTimers} timers); realigned ${realigned} ops; due dates ${dueUpdates} + planner reconcile ${dueReconciled}; order rollup ${rollup}; history ops ${historyEvents}; bumped ${bumped}.`
    );

    await printOrderTimeline(prisma, tenant.id, "ORD011-2026/10");
    await printOrderTimeline(prisma, tenant.id, "ORD012-2026/11");

    const { runLabAlliedDemoHeartbeat } = await import("../src/lib/server/lab-allied-demo-heartbeat");
    await runLabAlliedDemoHeartbeat(prisma, ctx);
    const wipAfterHeartbeat = await applyLabAlliedSteadyStateWip(prisma, tenant.id, user.id);
    const lateDemo = await seedLabAlliedLateDemoOrders(prisma, tenant.id);
    const bumpedAfterLate = await bumpPastScheduledStarts(prisma, tenant.id);
    console.log(
      `[lab-allied-demo] Post-seed demo heartbeat applied; WIP refresh ${wipAfterHeartbeat.wipOrders} orders (${wipAfterHeartbeat.runningTimers} timers); late demo ${lateDemo}; bumped ${bumpedAfterLate}.`
    );

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
    const blockingErrors = errorRows.filter(
      (row) =>
        !row.reason?.startsWith("Not started:") && !row.reason?.startsWith("Schedule finishes")
    );
    if (blockingErrors.length > 0) {
      for (const row of blockingErrors.slice(0, 25)) {
        console.log(`  [error] ${row.orderNumber} ${row.stepName}: ${row.reason ?? "unknown"}`);
      }
      throw new Error(`Unexpected Gantt errors after replan (got ${blockingErrors.length}).`);
    }
    await printLabAlliedUtilizationTable(prisma, tenant.id);
    await printLabAlliedRosterWarnings(prisma, tenant.id, user.id);

    if (gantt.lateSummary.lateOrders < 1 || gantt.lateSummary.lateOrders > 4) {
      throw new Error(`Expected 1–4 late orders for demo (got ${gantt.lateSummary.lateOrders}).`);
    }

    const execution = await getProductionExecutionSnapshot(ctx, { view: "all" });
    const activeExecution = Number(execution.kpis.find((row) => row.id === "active")?.value ?? 0);
    if (activeExecution === 0 && wipAfterHeartbeat.runningTimers === 0) {
      throw new Error("Execution must show active shop-floor timers after replan.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
