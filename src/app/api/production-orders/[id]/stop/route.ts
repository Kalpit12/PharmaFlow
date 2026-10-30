import { NextResponse } from "next/server";

import { parseShopFloorBody } from "@/lib/production-execution/shop-floor-action-input";
import { stopShopFloorOperation } from "@/lib/server/production-execution";
import { shopFloorErrorResponse } from "@/lib/server/shop-floor-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    const body = parseShopFloorBody(await request.json().catch(() => ({})));
    const result = await stopShopFloorOperation(ctx, id, body);
    return NextResponse.json(result);
  } catch (error) {
    return shopFloorErrorResponse(error, "Unable to stop production operation.");
  }
}
