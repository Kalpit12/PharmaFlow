import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { simulateDeliveryDate } from "@/lib/server/aps-plan";
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
    };
    if (!body.productId || typeof body.quantity !== "number" || !body.dueDate) {
      return NextResponse.json({ message: "Product, quantity, and due date are required." }, { status: 400 });
    }
    const simulation = await simulateDeliveryDate(ctx, {
      productId: body.productId,
      quantity: body.quantity,
      priority: body.priority,
      dueDate: body.dueDate,
    });
    return NextResponse.json({ simulation });
  } catch (error) {
    return jsonApiError(error, "Unable to simulate a delivery date.");
  }
}
