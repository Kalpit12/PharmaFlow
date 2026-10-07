import { NextResponse } from "next/server";

import { createCustomerOrder } from "@/lib/server/commercial-orders";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as {
      customerId?: string;
      productId?: string;
      quantity?: number;
      unitPrice?: string;
      status?: "CONFIRMED" | "FULFILLED";
    };
    if (!body.customerId) return NextResponse.json({ message: "Customer is required." }, { status: 400 });
    if (!body.productId) return NextResponse.json({ message: "Product is required." }, { status: 400 });
    if (typeof body.quantity !== "number") {
      return NextResponse.json({ message: "Quantity is required." }, { status: 400 });
    }
    if (!body.unitPrice) return NextResponse.json({ message: "Unit price is required." }, { status: 400 });

    const order = await createCustomerOrder(ctx, {
      customerId: body.customerId,
      productId: body.productId,
      quantity: body.quantity,
      unitPrice: body.unitPrice,
      status: body.status,
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
    return NextResponse.json({ message: "Unable to record customer order." }, { status: 503 });
  }
}
