import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { exportProductionSchedule } from "@/lib/server/aps-plan";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const schedule = await exportProductionSchedule(ctx);
    return NextResponse.json(schedule);
  } catch (error) {
    return jsonApiError(error, "Unable to export the production schedule.");
  }
}
