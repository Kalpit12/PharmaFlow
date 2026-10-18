import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";
import { getWorkstationSettings, patchWorkstationSettings, type WorkstationSettingsPatch } from "@/lib/server/workstation-settings";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await context.params;
    const data = await getWorkstationSettings(ctx, id);
    return NextResponse.json(data);
  } catch (error) {
    return jsonApiError(error, "Unable to load workstation settings.");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await context.params;
    const body = (await request.json()) as WorkstationSettingsPatch;
    await patchWorkstationSettings(ctx, id, body);
    const data = await getWorkstationSettings(ctx, id);
    return NextResponse.json(data);
  } catch (error) {
    return jsonApiError(error, "Unable to save workstation settings.");
  }
}
