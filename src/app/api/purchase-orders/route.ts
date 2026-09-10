import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";
import { createPurchaseOrderFromRfq } from "@/lib/server/purchase-orders";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    }
    const rfqId = body && typeof body === "object" && typeof (body as { rfqId?: string }).rfqId === "string" ? (body as { rfqId: string }).rfqId : "";
    if (!rfqId) return NextResponse.json({ message: "RFQ is required." }, { status: 400 });

    const purchaseOrder = await createPurchaseOrderFromRfq(ctx, rfqId);
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ServerError && error.code === "FORBIDDEN") {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    if (error instanceof ServerError && error.code === "NOT_FOUND") {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    if (error instanceof ServerError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "Unable to create purchase order." }, { status: 503 });
  }
}
