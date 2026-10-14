import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { recordProductionOperationEvent } from "@/lib/server/production-operation-events";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    const body = (await request.json()) as {
      eventType?: "START" | "STOP" | "DOWNTIME" | "SCRAP";
      quantity?: number;
      reason?: string;
    };
    if (!body.eventType) {
      return NextResponse.json({ message: "eventType is required." }, { status: 400 });
    }
    const event = await recordProductionOperationEvent(ctx, id, {
      eventType: body.eventType,
      quantity: body.quantity,
      reason: body.reason,
    });
    return NextResponse.json({ event });
  } catch (error) {
    return jsonApiError(error, "Unable to record shop-floor event.");
  }
}
