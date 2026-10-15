import { NextResponse } from "next/server";

import type { PlannerWebhookEventType } from "@prisma/client";

import { createWebhookSubscription, listWebhookSubscriptions } from "@/lib/server/planner-webhook-subscriptions";
import { jsonApiError } from "@/lib/server/api-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const subscriptions = await listWebhookSubscriptions(ctx);
    return NextResponse.json({ subscriptions });
  } catch (error) {
    return jsonApiError(error, "Unable to load webhooks.");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as {
      label?: string;
      endpointUrl?: string;
      secret?: string;
      events?: PlannerWebhookEventType[];
    };
    const subscription = await createWebhookSubscription(ctx, {
      label: body.label ?? "Planner webhook",
      endpointUrl: body.endpointUrl ?? "",
      secret: body.secret ?? "",
      events: body.events ?? ["SCHEDULE_PLAN_ACCEPTED"],
    });
    return NextResponse.json({ subscription });
  } catch (error) {
    return jsonApiError(error, "Unable to create webhook subscription.");
  }
}
