import { NextResponse } from "next/server";

import { createProductionOrder } from "@/lib/server/operations";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as {
      productId?: string;
      quantity?: number;
      priority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
      dueDate?: string;
      durationMinutes?: number;
    };
    if (!body.productId || typeof body.productId !== "string") {
      return NextResponse.json({ message: "Product is required." }, { status: 400 });
    }
    if (typeof body.quantity !== "number") {
      return NextResponse.json({ message: "Quantity is required." }, { status: 400 });
    }
    if (!body.dueDate || typeof body.dueDate !== "string") {
      return NextResponse.json({ message: "Due date is required." }, { status: 400 });
    }

    const order = await createProductionOrder(ctx, {
      productId: body.productId,
      quantity: body.quantity,
      priority: body.priority,
      dueDate: body.dueDate,
      durationMinutes: body.durationMinutes,
    });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ServerError && error.code === "FORBIDDEN") {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    if (error instanceof ServerError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "Unable to create production order." }, { status: 503 });
  }
}
