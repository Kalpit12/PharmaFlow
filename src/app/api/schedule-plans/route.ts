import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { getActiveProposal, proposeRescheduleAll } from "@/lib/server/aps-plan";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const proposal = await getActiveProposal(ctx);
    return NextResponse.json({ proposal });
  } catch (error) {
    return jsonApiError(error, "Unable to load the proposed schedule.");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json().catch(() => ({}))) as { windowStart?: string };
    const proposal = await proposeRescheduleAll(ctx, body.windowStart);
    return NextResponse.json({ proposal });
  } catch (error) {
    return jsonApiError(error, "Unable to propose a reschedule.");
  }
}
