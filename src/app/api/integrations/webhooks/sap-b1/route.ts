import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { processSapWebhook } from "@/lib/server/integrations/connector-service";
import { getPrisma } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const tenantSlug = request.headers.get("x-tenant-slug")?.trim();
    const secret = request.headers.get("x-connector-secret")?.trim();
    const idempotencyKey = request.headers.get("x-idempotency-key")?.trim();
    if (!tenantSlug || !secret || !idempotencyKey) {
      return NextResponse.json({ message: "x-tenant-slug, x-connector-secret, and x-idempotency-key are required." }, { status: 400 });
    }
    const tenant = await getPrisma().tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return NextResponse.json({ message: "Unknown tenant." }, { status: 404 });
    const body = (await request.json()) as {
      orders?: Array<{
        orderNumber?: string;
        sku: string;
        quantity: number;
        dueDate: string;
        priority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
      }>;
    };
    const result = await processSapWebhook(tenant.id, secret, idempotencyKey, body);
    return NextResponse.json(result);
  } catch (error) {
    return jsonApiError(error, "Unable to process SAP webhook.");
  }
}
