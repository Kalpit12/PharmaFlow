import { createHmac } from "node:crypto";

import type { PlannerWebhookEventType, Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";

export const PLANNER_WEBHOOK_EVENTS: PlannerWebhookEventType[] = [
  "SCHEDULE_PLAN_ACCEPTED",
  "PRODUCTION_JOB_STARTED",
  "PRODUCTION_JOB_COMPLETED",
  "PRODUCTION_ORDER_LATE",
  "BATCH_MATERIAL_DELAYED",
];

export type PlannerWebhookPayload = {
  event: PlannerWebhookEventType;
  tenantId: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export async function emitPlannerWebhook(
  ctx: TenantContext,
  event: PlannerWebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  const prisma = getPrisma();
  const subs = await prisma.plannerWebhookSubscription.findMany({
    where: { tenantId: ctx.tenantId, active: true },
  });
  if (subs.length === 0) return;

  const payload: PlannerWebhookPayload = {
    event,
    tenantId: ctx.tenantId,
    occurredAt: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      const events = Array.isArray(sub.events) ? (sub.events as string[]) : [];
      if (events.length > 0 && !events.includes(event)) return;

      const log = await prisma.plannerWebhookDeliveryLog.create({
        data: {
          tenantId: ctx.tenantId,
          subscriptionId: sub.id,
          eventType: event,
          payload: payload as unknown as Prisma.InputJsonValue,
          status: "PENDING",
        },
      });

      try {
        const response = await fetch(sub.endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pharmora-Event": event,
            "X-Pharmora-Signature": signPayload(sub.secret, body),
          },
          body,
          signal: AbortSignal.timeout(12_000),
        });
        await prisma.plannerWebhookDeliveryLog.update({
          where: { id: log.id },
          data: {
            status: response.ok ? "SENT" : "FAILED",
            responseCode: response.status,
            errorMessage: response.ok ? null : `HTTP ${response.status}`,
          },
        });
      } catch (error) {
        await prisma.plannerWebhookDeliveryLog.update({
          where: { id: log.id },
          data: {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : "Delivery failed",
          },
        });
      }
    })
  );
}
