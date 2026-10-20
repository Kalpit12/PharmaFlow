import type { PrismaClient } from "@prisma/client";

import { LAB_ALLIED_DEMO_SLUG } from "@/lib/demo-tenant";
import { acceptSchedulePlan, proposeRescheduleAll } from "@/lib/server/aps-plan";
import type { TenantContext } from "@/lib/server/errors";
import { getPrisma } from "@/lib/server/db";
import { runLabAlliedDemoHeartbeat } from "@/lib/server/lab-allied-demo-heartbeat";
import { bumpPastScheduledStarts } from "../../../prisma/bump-past-scheduled-starts";

const STALE_MS = 15 * 60_000;
const HEARTBEAT_PREFIX = "DEMO_HEARTBEAT ";

function advisoryLockKey(tenantId: string): number {
  let hash = 0;
  for (let i = 0; i < tenantId.length; i += 1) {
    hash = (hash * 31 + tenantId.charCodeAt(i)) % 2_147_483_647;
  }
  return hash + 9_001;
}

async function lastPlannerActivityMs(prisma: PrismaClient, tenantId: string): Promise<number> {
  const [heartbeat, plan] = await Promise.all([
    prisma.planningEvent.findFirst({
      where: { tenantId, summary: { startsWith: HEARTBEAT_PREFIX } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.schedulePlan.findFirst({
      where: { tenantId, status: "ACCEPTED" },
      orderBy: { acceptedAt: "desc" },
      select: { acceptedAt: true, updatedAt: true },
    }),
  ]);
  const hb = heartbeat?.createdAt.getTime() ?? 0;
  const planAt = plan?.acceptedAt?.getTime() ?? plan?.updatedAt.getTime() ?? 0;
  return Math.max(hb, planAt);
}

async function tryAdvisoryLock(prisma: PrismaClient, tenantId: string): Promise<boolean> {
  const key = advisoryLockKey(tenantId);
  const rows = await prisma.$queryRaw<{ pg_try_advisory_lock: boolean }[]>`
    SELECT pg_try_advisory_lock(${key}) AS "pg_try_advisory_lock"
  `;
  return rows[0]?.pg_try_advisory_lock === true;
}

async function releaseAdvisoryLock(prisma: PrismaClient, tenantId: string): Promise<void> {
  const key = advisoryLockKey(tenantId);
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${key})`;
}

/**
 * Demo / autopilot tenants: advance shop-floor demo state and roll the plan forward when stale.
 * Safe on Vercel Hobby (no cron required) — runs on Gantt / Execution page load.
 */
export async function ensurePlannerScheduleFreshOnLoad(ctx: TenantContext): Promise<boolean> {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { slug: true, status: true },
  });
  if (!tenant) return false;

  const policy = await prisma.planningPolicy.findUnique({ where: { tenantId: ctx.tenantId } });
  const autopilotOn = policy != null && policy.autopilotMode !== "OFF";
  const demoTenant = tenant.status === "DEMO" || tenant.slug === LAB_ALLIED_DEMO_SLUG;
  if (!demoTenant && !autopilotOn) return false;

  const lastMs = await lastPlannerActivityMs(prisma, ctx.tenantId);
  if (Date.now() - lastMs < STALE_MS) return false;

  const locked = await tryAdvisoryLock(prisma, ctx.tenantId);
  if (!locked) return false;

  try {
    const again = await lastPlannerActivityMs(prisma, ctx.tenantId);
    if (Date.now() - again < STALE_MS) return false;

    if (tenant.slug === LAB_ALLIED_DEMO_SLUG) {
      await runLabAlliedDemoHeartbeat(prisma, ctx);
      return true;
    }

    await bumpPastScheduledStarts(prisma, ctx.tenantId);
    if (autopilotOn) {
      const proposal = await proposeRescheduleAll(ctx, new Date().toISOString());
      if (proposal.id && policy?.autopilotMode === "AUTO_ACCEPT_UNLOCKED") {
        await acceptSchedulePlan(ctx, proposal.id);
      }
    }
    return true;
  } finally {
    await releaseAdvisoryLock(prisma, ctx.tenantId);
  }
}
