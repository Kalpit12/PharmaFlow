import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";
import { decideWorkflow } from "@/lib/server/workflows";

export const dynamic = "force-dynamic";

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
    const decision = body && typeof body === "object" ? (body as { decision?: string }).decision : null;
    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json({ message: "Invalid decision." }, { status: 400 });
    }
    const workflow = await decideWorkflow(ctx, id, decision);
    return NextResponse.json({ workflow });
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
    return NextResponse.json({ message: "Unable to update the workflow." }, { status: 503 });
  }
}
