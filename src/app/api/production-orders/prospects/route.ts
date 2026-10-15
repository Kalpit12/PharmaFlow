import { NextResponse } from "next/server";

import { createProductionProspect } from "@/lib/server/production-orders-phase2";
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
      customerId?: string;
      earliestStartAt?: string;
      scheduleDirection?: "FORWARD" | "JIT";
      reserveCapacity?: boolean;
      simulate?: boolean;
    };
    if (!body.productId || typeof body.quantity !== "number" || !body.dueDate) {
      return NextResponse.json({ message: "Product, quantity, and due date are required." }, { status: 400 });
    }
    const result = await createProductionProspect(ctx, {
      productId: body.productId,
      quantity: body.quantity,
      priority: body.priority,
      dueDate: body.dueDate,
      customerId: body.customerId,
      earliestStartAt: body.earliestStartAt,
      scheduleDirection: body.scheduleDirection,
      reserveCapacity: body.reserveCapacity,
      simulate: body.simulate,
    });
    return NextResponse.json(result);
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
    return NextResponse.json({ message: "Unable to create prospect." }, { status: 503 });
  }
}
