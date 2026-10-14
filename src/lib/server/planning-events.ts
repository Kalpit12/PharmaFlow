import type { PlanningEventType, Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
export async function writePlanningEvent(
  ctx: TenantContext,
  input: {
    eventType: PlanningEventType;
    summary: string;
    schedulePlanId?: string;
    idempotencyKey?: string;
  },
  client?: Prisma.TransactionClient
) {
  const db = client ?? getPrisma();
  if (input.idempotencyKey) {
    const existing = await db.planningEvent.findFirst({
      where: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
  }
  return db.planningEvent.create({
    data: {
      tenantId: ctx.tenantId,
      schedulePlanId: input.schedulePlanId,
      eventType: input.eventType,
      summary: input.summary,
      idempotencyKey: input.idempotencyKey,
      actorId: ctx.userId,
    },
  });
}

export async function findAcceptedPlanByIdempotencyKey(
  ctx: TenantContext,
  planId: string,
  idempotencyKey?: string
): Promise<string | null> {
  if (!idempotencyKey?.trim()) return null;
  const key = `accept:${planId}:${idempotencyKey.trim()}`;
  const existing = await getPrisma().planningEvent.findFirst({
    where: { tenantId: ctx.tenantId, idempotencyKey: key },
    select: { schedulePlanId: true },
  });
  return existing?.schedulePlanId ?? null;
}
