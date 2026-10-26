import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { qaReleaseProductionOperation } from "@/lib/server/production-execution";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { signature?: string };
    const result = await qaReleaseProductionOperation(ctx, id, { signature: body.signature ?? "" });
    return NextResponse.json(result);
  } catch (error) {
    return jsonApiError(error, "Unable to record QA release.");
  }
}
