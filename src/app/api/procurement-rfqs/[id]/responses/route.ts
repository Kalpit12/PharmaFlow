import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";
import { recordProcurementRfqResponse } from "@/lib/server/procurement-rfqs";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      supplierId?: string;
      currency?: string;
      leadTimeDays?: number | null;
      quotedAt?: string | null;
      notes?: string | null;
      items?: Array<{ rfqItemId: string; quantity: number; unitPrice?: number | null; notes?: string | null }>;
    };
    if (!payload.supplierId || !payload.items?.length) {
      return NextResponse.json({ message: "Supplier and line items are required." }, { status: 400 });
    }
    const rfq = await recordProcurementRfqResponse(ctx, id, {
      supplierId: payload.supplierId,
      currency: payload.currency,
      leadTimeDays: payload.leadTimeDays,
      quotedAt: payload.quotedAt,
      notes: payload.notes,
      items: payload.items,
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
    return NextResponse.json({ message: "Unable to record response." }, { status: 503 });
  }
}
