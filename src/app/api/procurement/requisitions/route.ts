import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";
import { createRequisitionDraft } from "@/lib/server/procurement";
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
    const productId = body && typeof body === "object" && typeof (body as { productId?: string }).productId === "string"
      ? (body as { productId: string }).productId
      : "";
    if (!productId) return NextResponse.json({ message: "Material is required." }, { status: 400 });

    const requisition = await createRequisitionDraft(ctx, productId);
    return NextResponse.json({ requisition });
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
    return NextResponse.json({ message: "Unable to create requisition draft." }, { status: 503 });
  }
}
