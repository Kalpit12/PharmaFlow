import { NextResponse } from "next/server";

import { createPlannerDashboard, listPlannerDashboards } from "@/lib/server/planner-dashboards";
import { jsonApiError } from "@/lib/server/api-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const dashboards = await listPlannerDashboards(ctx);
    return NextResponse.json({ dashboards });
  } catch (error) {
    return jsonApiError(error, "Unable to load dashboards.");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as { name?: string; cloneFromId?: string | null };
    const dashboard = await createPlannerDashboard(ctx, {
      name: body.name ?? "New dashboard",
      cloneFromId: body.cloneFromId ?? null,
    });
    return NextResponse.json({ dashboard });
  } catch (error) {
    return jsonApiError(error, "Unable to create dashboard.");
  }
}
