import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";
import { awardProcurementRfqResponse } from "@/lib/server/procurement-rfqs";
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
    const responseId = (body as { responseId?: string }).responseId;
    if (!responseId) return NextResponse.json({ message: "Response is required." }, { status: 400 });
    const rfq = await awardProcurementRfqResponse(ctx, id, responseId);
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
    return NextResponse.json({ message: "Unable to award response." }, { status: 503 });
  }
}
