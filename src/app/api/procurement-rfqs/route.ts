import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";
import { createProcurementRfqDraft, createProcurementRfqFromRecommendation } from "@/lib/server/procurement-rfqs";
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
    const payload = body as {
      mode?: string;
      productId?: string;
      requisitionId?: string;
      title?: string;
      dueDate?: string | null;
      notes?: string | null;
      items?: Array<{ productId: string; quantity: number; notes?: string }>;
      supplierIds?: string[];
    };

    if (payload.mode === "from-procurement") {
      if (!payload.productId) return NextResponse.json({ message: "Material is required." }, { status: 400 });
      const rfq = await createProcurementRfqFromRecommendation(ctx, {
        productId: payload.productId,
        requisitionId: payload.requisitionId,
      });
      return NextResponse.json({ rfq });
    }

    if (!payload.title?.trim() || !payload.items?.length) {
      return NextResponse.json({ message: "Title and at least one item are required." }, { status: 400 });
    }

    const rfq = await createProcurementRfqDraft(ctx, {
      title: payload.title,
      dueDate: payload.dueDate,
      notes: payload.notes,
      items: payload.items,
      supplierIds: payload.supplierIds,
    });
    return NextResponse.json({ rfq });
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
    return NextResponse.json({ message: "Unable to create RFQ." }, { status: 503 });
  }
}
