import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";
import { updatePurchaseOrderDraft } from "@/lib/server/purchase-orders";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    }
    const payload = body as {
      notes?: string | null;
      items?: Array<{ id: string; quantity: number; unitPrice: number }>;
    };
    if (!payload.items?.length) return NextResponse.json({ message: "Line items are required." }, { status: 400 });

    const purchaseOrder = await updatePurchaseOrderDraft(ctx, id, {
      notes: payload.notes,
      items: payload.items,
    });
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ServerError && error.code === "NOT_FOUND") {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    if (error instanceof ServerError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "Unable to update purchase order." }, { status: 503 });
  }
}
