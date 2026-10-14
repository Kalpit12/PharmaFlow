import type { ProductionOperationEventType } from "@prisma/client";

import { requirePermission } from "@/lib/auth/authorization";
import { writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";

export type ShopFloorEventView = {
  id: string;
  eventType: ProductionOperationEventType;
  quantity: number | null;
  reason: string | null;
  recordedAt: string;
  actorName: string | null;
};

export async function recordProductionOperationEvent(
  ctx: TenantContext,
  productionOperationId: string,
  input: {
    eventType: ProductionOperationEventType;
    quantity?: number;
    reason?: string;
  }
): Promise<ShopFloorEventView> {
  requirePermission(ctx, "production.execute");
  const prisma = getPrisma();
  const operation = await prisma.productionOperation.findFirst({
    where: { id: productionOperationId, tenantId: ctx.tenantId },
    include: { productionOrder: { select: { orderNumber: true } } },
  });
  if (!operation) throw new ServerError("Production operation not found.", "NOT_FOUND");
  if (input.eventType === "SCRAP" && (input.quantity == null || input.quantity <= 0)) {
    throw new ServerError("Scrap events require a positive quantity.", "INTERNAL");
  }
  if ((input.eventType === "DOWNTIME" || input.eventType === "SCRAP") && !input.reason?.trim()) {
    throw new ServerError("A reason is required for downtime and scrap events.", "INTERNAL");
  }

  const row = await prisma.productionOperationEvent.create({
    data: {
      tenantId: ctx.tenantId,
      productionOperationId,
      eventType: input.eventType,
      quantity: input.quantity ?? null,
      reason: input.reason?.trim() || null,
      recordedById: ctx.userId,
    },
    include: { recordedBy: { select: { name: true } } },
  });

  await writeAuditLog(ctx, {
    action: "PRODUCTION_SHOP_FLOOR_EVENT",
    entityType: "PRODUCTION_ORDER",
    entityId: operation.productionOrderId,
    newValue: `${input.eventType} on ${operation.operationCode}`,
    reason: input.reason?.trim() || null,
  });

  if (input.eventType === "DOWNTIME" || input.eventType === "SCRAP") {
    const { maybeTriggerShopFloorReplan } = await import("@/lib/server/shop-floor-replan");
    await maybeTriggerShopFloorReplan(ctx, {
      operationId: productionOperationId,
      eventType: input.eventType,
      reason: input.reason,
    });
  }

  return {
    id: row.id,
    eventType: row.eventType,
    quantity: row.quantity,
    reason: row.reason,
    recordedAt: row.recordedAt.toISOString(),
    actorName: row.recordedBy?.name ?? null,
  };
}

export async function listRecentShopFloorEvents(
  ctx: TenantContext,
  productionOperationIds: string[]
): Promise<Map<string, ShopFloorEventView[]>> {
  if (productionOperationIds.length === 0) return new Map();
  const prisma = getPrisma();
  const rows = await prisma.productionOperationEvent.findMany({
    where: { tenantId: ctx.tenantId, productionOperationId: { in: productionOperationIds } },
    include: { recordedBy: { select: { name: true } } },
    orderBy: { recordedAt: "desc" },
    take: 200,
  });
  const map = new Map<string, ShopFloorEventView[]>();
  for (const row of rows) {
    const list = map.get(row.productionOperationId) ?? [];
    if (list.length >= 5) continue;
    list.push({
      id: row.id,
      eventType: row.eventType,
      quantity: row.quantity,
      reason: row.reason,
      recordedAt: row.recordedAt.toISOString(),
      actorName: row.recordedBy?.name ?? null,
    });
    map.set(row.productionOperationId, list);
  }
  return map;
}
