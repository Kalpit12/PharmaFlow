import { NextResponse } from "next/server";

import { authenticateApiKey, requireApiScope, tenantContextFromApiKey } from "@/lib/server/api-key-auth";
import { importProductionOrders } from "@/lib/server/aps-plan";
import { jsonApiError } from "@/lib/server/api-route";
import { getPrisma } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    requireApiScope(auth, "production.read");
    const rows = await getPrisma().productionOrder.findMany({
      where: { tenantId: auth.tenantId },
      include: { product: { select: { sku: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 100,
    });
    return NextResponse.json({
      orders: rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        sku: row.product.sku,
        productName: row.product.name,
        quantity: row.quantity,
        status: row.status,
        priority: row.priority,
        dueDate: row.dueDate.toISOString(),
        plannedStart: row.plannedStart?.toISOString() ?? null,
        plannedEnd: row.plannedEnd?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return jsonApiError(error, "Unable to list production orders.");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    requireApiScope(auth, "production.write");
    const ctx = tenantContextFromApiKey(auth);
    const body = (await request.json()) as {
      idempotencyKey?: string;
      orders?: Array<{
        orderNumber?: string;
        sku: string;
        quantity: number;
        dueDate: string;
        priority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
      }>;
    };
    const result = await importProductionOrders(ctx, body.orders ?? [], { idempotencyKey: body.idempotencyKey });
    return NextResponse.json(result);
  } catch (error) {
    return jsonApiError(error, "Unable to upsert production orders.");
  }
}
