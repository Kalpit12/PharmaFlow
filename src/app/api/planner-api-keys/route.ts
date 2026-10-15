import { NextResponse } from "next/server";

import { createTenantApiKey, listTenantApiKeys } from "@/lib/server/tenant-api-keys";
import { jsonApiError } from "@/lib/server/api-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const keys = await listTenantApiKeys(ctx);
    return NextResponse.json({ keys });
  } catch (error) {
    return jsonApiError(error, "Unable to list API keys.");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as { name?: string; scopes?: string[] };
    const created = await createTenantApiKey(ctx, { name: body.name ?? "Integration key", scopes: body.scopes });
    return NextResponse.json(created);
  } catch (error) {
    return jsonApiError(error, "Unable to create API key.");
  }
}
