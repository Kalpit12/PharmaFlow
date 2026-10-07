import { NextResponse } from "next/server";

import type { AutopilotMode } from "@prisma/client";

import { jsonApiError } from "@/lib/server/api-route";
import { getOrCreatePlanningPolicy, updatePlanningPolicy } from "@/lib/server/aps-plan";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const policy = await getOrCreatePlanningPolicy(ctx);
    return NextResponse.json({ policy });
  } catch (error) {
    return jsonApiError(error, "Unable to load planning policy.");
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as {
      priorityWeight?: number;
      dueDateWeight?: number;
      changeoverWeight?: number;
      utilizationWeight?: number;
      freezeMinutes?: number;
      autopilotMode?: AutopilotMode;
    };
    const policy = await updatePlanningPolicy(ctx, body);
    return NextResponse.json({ policy });
  } catch (error) {
    return jsonApiError(error, "Unable to update planning policy.");
  }
}
