import { NextResponse } from "next/server";

import { holdProductionBatch } from "@/lib/server/batches";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    const body = (await request.json()) as { reason?: string };
    const result = await holdProductionBatch(ctx, id, body.reason ?? "");
    return NextResponse.json(result);
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
    return NextResponse.json({ message: "Unable to place batch on hold." }, { status: 503 });
  }
}
