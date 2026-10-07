import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { importProductionOrders } from "@/lib/server/aps-plan";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as {
      orders?: Array<{
        orderNumber?: string;
        sku: string;
        quantity: number;
        dueDate: string;
        priority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
      }>;
    };
    const result = await importProductionOrders(ctx, body.orders ?? []);
    return NextResponse.json(result);
  } catch (error) {
    return jsonApiError(error, "Unable to import production orders.");
  }
}
