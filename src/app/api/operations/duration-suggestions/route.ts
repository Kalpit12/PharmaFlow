import { NextResponse } from "next/server";

import { acceptDurationSuggestion, getDurationLearningSnapshot } from "@/lib/server/duration-learning";
import { shopFloorErrorResponse } from "@/lib/server/shop-floor-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAuthenticatedTenantContext();
    return NextResponse.json(await getDurationLearningSnapshot(ctx));
  } catch (error) {
    return shopFloorErrorResponse(error, "Unable to load duration suggestions.");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json().catch(() => ({}))) as {
      routingOperationId?: string;
      suggestedRunMinutes?: number;
      reason?: string;
    };
    if (!body.routingOperationId || !Number.isFinite(Number(body.suggestedRunMinutes))) {
      return NextResponse.json({ message: "routingOperationId and suggestedRunMinutes are required." }, { status: 400 });
    }
    const result = await acceptDurationSuggestion(ctx, {
      routingOperationId: body.routingOperationId,
      suggestedRunMinutes: Number(body.suggestedRunMinutes),
      reason: body.reason,
    });
    return NextResponse.json(result);
  } catch (error) {
    return shopFloorErrorResponse(error, "Unable to accept the duration suggestion.");
  }
}
