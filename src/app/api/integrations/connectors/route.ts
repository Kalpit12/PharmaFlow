import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { listConnectors } from "@/lib/server/integrations/connector-service";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const connectors = await listConnectors(ctx);
    return NextResponse.json({ connectors });
  } catch (error) {
    return jsonApiError(error, "Unable to list integration connectors.");
  }
}
