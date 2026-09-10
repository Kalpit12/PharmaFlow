import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";
import { updateProductionOrderSchedule, type ScheduleUpdateInput } from "@/lib/server/operations";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    const body = (await request.json()) as ScheduleUpdateInput;
    const order = await updateProductionOrderSchedule(ctx, id, body);
    return NextResponse.json({ order });
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
    return NextResponse.json({ message: "Unable to update production schedule." }, { status: 503 });
  }
}
