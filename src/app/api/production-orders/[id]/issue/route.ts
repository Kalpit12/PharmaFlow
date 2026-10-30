import { NextResponse } from "next/server";

import { parseShopFloorBody } from "@/lib/production-execution/shop-floor-action-input";
import { raiseShopFloorIssue } from "@/lib/server/shop-floor-issues";
import { shopFloorErrorResponse } from "@/lib/server/shop-floor-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseShopFloorBody(raw);
    const result = await raiseShopFloorIssue(ctx, id, {
      kind: String(raw.kind ?? ""),
      description: String(raw.description ?? ""),
      severity: typeof raw.severity === "string" ? raw.severity : undefined,
      downHours: Number(raw.downHours) || 0,
      recordedAt: parsed.recordedAt,
      expectedOperationId: parsed.expectedOperationId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return shopFloorErrorResponse(error, "Unable to raise the shop-floor issue.");
  }
}
