import { getOrCreatePlanningPolicy, proposeRescheduleAll, acceptSchedulePlan } from "@/lib/server/aps-plan";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { writePlanningEvent } from "@/lib/server/planning-events";

const DEBOUNCE_MS = 2 * 60_000;

export async function maybeTriggerShopFloorReplan(
  ctx: TenantContext,
  trigger: { operationId: string; eventType: string; reason?: string | null }
) {
  const policy = await getOrCreatePlanningPolicy(ctx);
  if (policy.autopilotMode === "OFF") return null;

  const prisma = getPrisma();
  const recent = await prisma.planningEvent.findFirst({
    where: {
      tenantId: ctx.tenantId,
      eventType: "SHOP_FLOOR_TRIGGERED",
      createdAt: { gte: new Date(Date.now() - DEBOUNCE_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) return null;

  await writePlanningEvent(ctx, {
    eventType: "SHOP_FLOOR_TRIGGERED",
    summary: `Shop-floor ${trigger.eventType} on operation ${trigger.operationId}: ${trigger.reason ?? "no reason"}`,
    idempotencyKey: `shop-floor:${trigger.operationId}:${Date.now()}`,
  });

  const proposal = await proposeRescheduleAll(ctx);
  if (policy.autopilotMode === "AUTO_ACCEPT_UNLOCKED") {
    return acceptSchedulePlan(ctx, proposal.id);
  }
  return proposal;
}
