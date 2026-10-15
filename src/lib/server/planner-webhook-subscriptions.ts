import type { PlannerWebhookEventType } from "@prisma/client";

import { PLANNER_WEBHOOK_EVENTS } from "@/lib/server/planner-webhooks";
import { requirePermission } from "@/lib/auth/authorization";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";

export type WebhookSubscriptionView = {
  id: string;
  label: string;
  endpointUrl: string;
  events: PlannerWebhookEventType[];
  active: boolean;
  createdAt: string;
};

export async function listWebhookSubscriptions(ctx: TenantContext): Promise<WebhookSubscriptionView[]> {
  requirePermission(ctx, "production.global_rules");
  const rows = await getPrisma().plannerWebhookSubscription.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    endpointUrl: row.endpointUrl,
    events: (row.events as PlannerWebhookEventType[]) ?? [],
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createWebhookSubscription(
  ctx: TenantContext,
  input: { label: string; endpointUrl: string; secret: string; events: PlannerWebhookEventType[] }
): Promise<WebhookSubscriptionView> {
  requirePermission(ctx, "production.global_rules");
  const label = input.label.trim();
  const endpointUrl = input.endpointUrl.trim();
  const secret = input.secret.trim();
  if (!label || !endpointUrl || !secret) throw new ServerError("label, endpointUrl, and secret are required.", "INTERNAL");
  const events = input.events.filter((event) => PLANNER_WEBHOOK_EVENTS.includes(event));
  if (events.length === 0) throw new ServerError("Select at least one event.", "INTERNAL");

  const row = await getPrisma().plannerWebhookSubscription.create({
    data: {
      tenantId: ctx.tenantId,
      label,
      endpointUrl,
      secret,
      events,
    },
  });
  return {
    id: row.id,
    label: row.label,
    endpointUrl: row.endpointUrl,
    events: events,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}
