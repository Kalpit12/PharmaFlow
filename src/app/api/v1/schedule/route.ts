import { NextResponse } from "next/server";

import { authenticateApiKey, requireApiScope, tenantContextFromApiKey } from "@/lib/server/api-key-auth";
import { exportProductionSchedule } from "@/lib/server/aps-plan";
import { jsonApiError } from "@/lib/server/api-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    requireApiScope(auth, "schedule.read");
    const ctx = tenantContextFromApiKey(auth);
    const schedule = await exportProductionSchedule(ctx);
    return NextResponse.json(schedule);
  } catch (error) {
    return jsonApiError(error, "Unable to export schedule.");
  }
}
