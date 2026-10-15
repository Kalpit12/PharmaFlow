import { NextResponse } from "next/server";

import { authenticateApiKey, requireApiScope, tenantContextFromApiKey } from "@/lib/server/api-key-auth";
import { jsonApiError } from "@/lib/server/api-route";
import { getPrisma } from "@/lib/server/db";
import { recordProductionOperationEvent } from "@/lib/server/production-operation-events";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    requireApiScope(auth, "timelogs.read");
    const since = new Date(Date.now() - 30 * 86_400_000);
    const rows = await getPrisma().productionOperationEvent.findMany({
      where: { tenantId: auth.tenantId, recordedAt: { gte: since } },
      include: {
        productionOperation: {
          select: {
            operationCode: true,
            productionOrder: { select: { orderNumber: true } },
            workstation: { select: { code: true } },
          },
        },
      },
      orderBy: { recordedAt: "desc" },
      take: 200,
    });
    return NextResponse.json({
      timelogs: rows.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        recordedAt: row.recordedAt.toISOString(),
        orderNumber: row.productionOperation.productionOrder.orderNumber,
        operationCode: row.productionOperation.operationCode,
        workstationCode: row.productionOperation.workstation?.code ?? null,
        quantity: row.quantity,
        reason: row.reason,
      })),
    });
  } catch (error) {
    return jsonApiError(error, "Unable to list timelogs.");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    requireApiScope(auth, "timelogs.write");
    const ctx = tenantContextFromApiKey(auth);
    const body = (await request.json()) as {
      productionOperationId?: string;
      eventType?: "START" | "STOP" | "DOWNTIME" | "SCRAP";
      quantity?: number;
      reason?: string;
    };
    if (!body.productionOperationId || !body.eventType) {
      return NextResponse.json({ message: "productionOperationId and eventType are required." }, { status: 400 });
    }
    const event = await recordProductionOperationEvent(ctx, body.productionOperationId, {
      eventType: body.eventType,
      quantity: body.quantity,
      reason: body.reason,
    });
    return NextResponse.json({ event });
  } catch (error) {
    return jsonApiError(error, "Unable to record timelog.");
  }
}
