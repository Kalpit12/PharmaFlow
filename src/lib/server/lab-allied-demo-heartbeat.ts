import type { PrismaClient } from "@prisma/client";

import { LAB_ALLIED_DEMO_SLUG } from "@/lib/demo-tenant";
import { acceptSchedulePlan, proposeRescheduleAll } from "@/lib/server/aps-plan";
import type { TenantContext } from "@/lib/server/errors";
import { bumpPastScheduledStarts } from "../../../prisma/bump-past-scheduled-starts";
import { realignDemoScheduleToShifts } from "../../../prisma/realign-demo-schedule-to-shifts";
import { reconcileLabAlliedDueDatesWithPlanner } from "../../../prisma/reconcile-lab-allied-due-dates-with-planner";
import { syncLabAlliedDueDatesAfterSchedule } from "../../../prisma/sync-lab-allied-due-dates";
import { syncLabAlliedOrderWorkstations } from "../../../prisma/sync-lab-allied-order-workstations";

const ELAPSED_CODES = new Set(["QUAR", "QC", "QC-HOLD"]);
const HEARTBEAT_SUMMARY_PREFIX = "DEMO_HEARTBEAT ";

export type DemoHeartbeatResult = {
  tenantId: string;
  completedOps: number;
  qaReleased: number;
  replanned: boolean;
};

async function openRunningOperationIds(prisma: PrismaClient, tenantId: string): Promise<Set<string>> {
  const events = await prisma.productionOperationEvent.findMany({
    where: { tenantId },
    orderBy: { recordedAt: "desc" },
    select: { productionOperationId: true, eventType: true },
  });
  const latest = new Map<string, string>();
  for (const row of events) {
    if (latest.has(row.productionOperationId)) continue;
    latest.set(row.productionOperationId, row.eventType);
  }
  const open = new Set<string>();
  for (const [opId, type] of latest) {
    if (type === "START") open.add(opId);
  }
  return open;
}

/** Advance demo plant state: complete overdue steps, QA-release elapsed holds, replan queue. */
export async function runLabAlliedDemoHeartbeat(
  prisma: PrismaClient,
  ctx: TenantContext,
  options?: { until?: Date }
): Promise<DemoHeartbeatResult> {
  const now = options?.until ?? new Date();
  let completedOps = 0;
  let qaReleased = 0;

  const runningOpIds = await openRunningOperationIds(prisma, ctx.tenantId);
  const runningOps = await prisma.productionOperation.findMany({
    where: {
      tenantId: ctx.tenantId,
      id: { in: [...runningOpIds] },
      status: "IN_PROGRESS",
    },
    include: { productionOrder: { select: { quantity: true } } },
  });

  for (const op of runningOps) {
    if (!op.plannedEnd || op.plannedEnd.getTime() > now.getTime()) continue;
    if (ELAPSED_CODES.has(op.operationCode)) continue;
    const qtyGood = Math.round(op.productionOrder.quantity * (0.92 + (op.sequence % 7) * 0.01));
    await prisma.productionOperationEvent.create({
      data: {
        tenantId: ctx.tenantId,
        productionOperationId: op.id,
        eventType: "STOP",
        recordedAt: op.plannedEnd,
        quantity: qtyGood,
        reason: "Demo heartbeat",
        recordedById: ctx.userId,
      },
    });
    await prisma.productionOperation.update({
      where: { id: op.id },
      data: { status: "COMPLETED", actualEnd: op.plannedEnd },
    });
    completedOps += 1;
  }

  const elapsedInProgress = await prisma.productionOperation.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "IN_PROGRESS",
      operationCode: { in: [...ELAPSED_CODES] },
      plannedEnd: { lte: now },
    },
  });
  for (const op of elapsedInProgress) {
    await prisma.productionOperation.update({
      where: { id: op.id },
      data: { status: "COMPLETED", actualEnd: op.plannedEnd ?? now },
    });
    await prisma.productionOperationEvent.create({
      data: {
        tenantId: ctx.tenantId,
        productionOperationId: op.id,
        eventType: "STOP",
        recordedAt: op.plannedEnd ?? now,
        recordedById: ctx.userId,
        reason: "QA release (demo)",
      },
    });
    qaReleased += 1;
  }

  const proposal = await proposeRescheduleAll(ctx, now.toISOString());
  if (proposal.id) {
    await acceptSchedulePlan(ctx, proposal.id);
  }
  await realignDemoScheduleToShifts(prisma, ctx.tenantId);
  await syncLabAlliedDueDatesAfterSchedule(prisma, ctx.tenantId);
  await reconcileLabAlliedDueDatesWithPlanner(prisma, ctx);
  await bumpPastScheduledStarts(prisma, ctx.tenantId);
  await syncLabAlliedOrderWorkstations(prisma, ctx.tenantId);

  await prisma.planningEvent.create({
    data: {
      tenantId: ctx.tenantId,
      eventType: "IMPORTED",
      summary: `${HEARTBEAT_SUMMARY_PREFIX}${now.toISOString()}`,
      idempotencyKey: `demo-heartbeat:${Math.floor(now.getTime() / (30 * 60_000))}`,
      actorId: ctx.userId,
    },
  });

  return {
    tenantId: ctx.tenantId,
    completedOps,
    qaReleased,
    replanned: Boolean(proposal.id),
  };
}

/** Max simulated catchup window (avoids hundreds of replans when no heartbeat was logged yet). */
const CATCHUP_MAX_LOOKBACK_MS = 48 * 60 * 60_000;

export async function runLabAlliedDemoCatchup(prisma: PrismaClient, ctx: TenantContext): Promise<number> {
  const last = await prisma.planningEvent.findFirst({
    where: { tenantId: ctx.tenantId, summary: { startsWith: HEARTBEAT_SUMMARY_PREFIX } },
    orderBy: { createdAt: "desc" },
  });
  const end = new Date();
  const fallbackStart = new Date(end.getTime() - CATCHUP_MAX_LOOKBACK_MS);
  const start = last?.createdAt ?? fallbackStart;
  const effectiveStartMs = Math.max(start.getTime(), end.getTime() - CATCHUP_MAX_LOOKBACK_MS);
  let ticks = 0;
  for (let t = effectiveStartMs + 30 * 60_000; t <= end.getTime(); t += 30 * 60_000) {
    await runLabAlliedDemoHeartbeat(prisma, ctx, { until: new Date(t) });
    ticks += 1;
  }
  await runLabAlliedDemoHeartbeat(prisma, ctx, { until: end });
  return ticks + 1;
}

export async function maybeRunStaleDemoCatchup(
  prisma: PrismaClient,
  ctx: TenantContext,
  staleMinutes = 15
): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { slug: true, status: true } });
  if (!tenant || tenant.slug !== LAB_ALLIED_DEMO_SLUG || tenant.status !== "DEMO") return false;
  const policy = await prisma.planningPolicy.findUnique({ where: { tenantId: ctx.tenantId } });
  if (!policy || policy.autopilotMode === "OFF") return false;
  const last = await prisma.planningEvent.findFirst({
    where: { tenantId: ctx.tenantId, summary: { startsWith: HEARTBEAT_SUMMARY_PREFIX } },
    orderBy: { createdAt: "desc" },
  });
  const ageMs = Date.now() - (last?.createdAt.getTime() ?? 0);
  if (ageMs < staleMinutes * 60_000) return false;
  await runLabAlliedDemoCatchup(prisma, ctx);
  return true;
}
