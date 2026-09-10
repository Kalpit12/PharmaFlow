import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";
import { getRequisitionDetail, reviewRequisition } from "@/lib/server/procurement";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await context.params;
    const requisition = await getRequisitionDetail(ctx, id);
    return NextResponse.json({ requisition });
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ServerError && error.code === "NOT_FOUND") {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: "Unable to load requisition." }, { status: 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    }
    const decision = body && typeof body === "object" ? (body as { decision?: string }).decision : undefined;
    if (decision !== "review" && decision !== "reject") {
      return NextResponse.json({ message: "Decision must be review or reject." }, { status: 400 });
    }

    const requisition = await reviewRequisition(ctx, id, decision);
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
    return NextResponse.json({ message: "Unable to update requisition." }, { status: 503 });
  }
}
