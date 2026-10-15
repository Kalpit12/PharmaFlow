import { NextResponse } from "next/server";

import type { PlannerWidgetType } from "@prisma/client";

import { deletePlannerDashboard, updatePlannerDashboard } from "@/lib/server/planner-dashboards";
import { jsonApiError } from "@/lib/server/api-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      dateFrom?: string | null;
      dateTo?: string | null;
      widgets?: PlannerWidgetType[];
      isDefault?: boolean;
    };
    const dashboard = await updatePlannerDashboard(ctx, id, body);
    return NextResponse.json({ dashboard });
  } catch (error) {
    return jsonApiError(error, "Unable to update dashboard.");
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    await deletePlannerDashboard(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonApiError(error, "Unable to delete dashboard.");
  }
}
