import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { syncConnector } from "@/lib/server/integrations/connector-service";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    const result = await syncConnector(ctx, id);
    return NextResponse.json({ result });
  } catch (error) {
    return jsonApiError(error, "Unable to sync connector.");
  }
}
