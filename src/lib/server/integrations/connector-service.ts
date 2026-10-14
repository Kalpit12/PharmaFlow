import type { IntegrationConnectorType } from "@prisma/client";

import { exportProductionSchedule, importProductionOrders } from "@/lib/server/aps-plan";
import { requirePermission } from "@/lib/auth/authorization";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";

export type ConnectorView = {
  id: string;
  type: IntegrationConnectorType;
  name: string;
  status: string;
  endpointUrl: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
};

export async function ensureDefaultConnectors(ctx: TenantContext) {
  const prisma = getPrisma();
  const defaults: Array<{ type: IntegrationConnectorType; name: string; webhookSecret: string }> = [
    { type: "SAP_B1", name: "SAP Business One (HANA)", webhookSecret: "demo-sap-b1-secret" },
    { type: "MES_SHOP_FLOOR", name: "Shop-floor MES bridge", webhookSecret: "demo-mes-secret" },
  ];
  for (const row of defaults) {
    await prisma.integrationConnector.upsert({
      where: { tenantId_type: { tenantId: ctx.tenantId, type: row.type } },
      create: {
        tenantId: ctx.tenantId,
        type: row.type,
        name: row.name,
        status: "ACTIVE",
        webhookSecret: row.webhookSecret,
        endpointUrl: null,
        config: { mode: "internal-replay", description: "Demo connector replays into Pharmora tenant data." },
      },
      update: {},
    });
  }
}

export async function listConnectors(ctx: TenantContext): Promise<ConnectorView[]> {
  requirePermission(ctx, "production.read");
  await ensureDefaultConnectors(ctx);
  const rows = await getPrisma().integrationConnector.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { type: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    status: row.status,
    endpointUrl: row.endpointUrl,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row.lastSyncStatus ?? null,
  }));
}

async function recordSyncRun(
  ctx: TenantContext,
  connectorId: string,
  direction: "INBOUND" | "OUTBOUND",
  status: "SUCCESS" | "FAILED" | "PARTIAL",
  summary: string,
  recordsProcessed: number,
  errorMessage?: string
) {
  const prisma = getPrisma();
  const now = new Date();
  await prisma.integrationSyncRun.create({
    data: {
      tenantId: ctx.tenantId,
      connectorId,
      direction,
      status,
      summary,
      recordsProcessed,
      errorMessage,
      completedAt: now,
    },
  });
  await prisma.integrationConnector.update({
    where: { id: connectorId },
    data: { lastSyncAt: now, lastSyncStatus: status, status: status === "FAILED" ? "ERROR" : "ACTIVE" },
  });
}

export async function syncConnector(ctx: TenantContext, connectorId: string) {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const connector = await prisma.integrationConnector.findFirst({
    where: { id: connectorId, tenantId: ctx.tenantId },
  });
  if (!connector) throw new ServerError("Connector not found.", "NOT_FOUND");
  if (connector.status === "DISABLED") throw new ServerError("Connector is disabled.", "FORBIDDEN");

  try {
    if (connector.type === "SAP_B1") {
      const exported = await exportProductionSchedule(ctx);
      if (connector.endpointUrl) {
        await fetch(connector.endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(exported),
        });
      }
      await recordSyncRun(
        ctx,
        connector.id,
        "OUTBOUND",
        "SUCCESS",
        `Pushed ${exported.orders.length} orders to SAP B1 contract.`,
        exported.orders.length
      );
      return { direction: "OUTBOUND", records: exported.orders.length };
    }

    const inbound = await prisma.productionOperationEvent.count({
      where: { tenantId: ctx.tenantId, recordedAt: { gte: new Date(Date.now() - 24 * 86_400_000) } },
    });
    await recordSyncRun(
      ctx,
      connector.id,
      "INBOUND",
      "SUCCESS",
      `Reconciled ${inbound} shop-floor events from MES.`,
      inbound
    );
    return { direction: "INBOUND", records: inbound };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    await recordSyncRun(ctx, connector.id, "OUTBOUND", "FAILED", "Connector sync failed.", 0, message);
    throw new ServerError(message, "INTERNAL");
  }
}

export async function syncAllActiveConnectors(ctx: TenantContext) {
  await ensureDefaultConnectors(ctx);
  const connectors = await getPrisma().integrationConnector.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
  });
  const results = [];
  for (const connector of connectors) {
    results.push(await syncConnector(ctx, connector.id));
  }
  return results;
}

export async function processSapWebhook(
  tenantId: string,
  secret: string,
  idempotencyKey: string,
  payload: {
    orders?: Array<{
      orderNumber?: string;
      sku: string;
      quantity: number;
      dueDate: string;
      priority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
    }>;
  }
) {
  const prisma = getPrisma();
  const connector = await prisma.integrationConnector.findFirst({
    where: { tenantId, type: "SAP_B1", status: "ACTIVE" },
  });
  if (!connector || connector.webhookSecret !== secret) {
    throw new ServerError("Invalid SAP connector credentials.", "FORBIDDEN");
  }
  const existing = await prisma.integrationWebhookDelivery.findUnique({
    where: { tenantId_connectorId_idempotencyKey: { tenantId, connectorId: connector.id, idempotencyKey } },
  });
  if (existing) return { replayed: true, result: existing.payload };

  const user = await prisma.user.findFirst({ where: { tenantId, status: "ACTIVE" } });
  if (!user) throw new ServerError("Tenant has no active user for integration.", "INTERNAL");
  const ctx = { tenantId, userId: user.id, role: user.role };
  const result = await importProductionOrders(ctx, payload.orders ?? [], { idempotencyKey });
  await prisma.integrationWebhookDelivery.create({
    data: {
      tenantId,
      connectorId: connector.id,
      idempotencyKey,
      payload: result,
    },
  });
  await recordSyncRun(ctx, connector.id, "INBOUND", "SUCCESS", `SAP webhook imported ${result.imported} orders.`, result.imported);
  return { replayed: false, result };
}

export async function processMesWebhook(
  tenantId: string,
  secret: string,
  idempotencyKey: string,
  payload: {
    productionOperationId: string;
    eventType: "START" | "STOP" | "DOWNTIME" | "SCRAP";
    quantity?: number;
    reason?: string;
  }
) {
  const prisma = getPrisma();
  const connector = await prisma.integrationConnector.findFirst({
    where: { tenantId, type: "MES_SHOP_FLOOR", status: "ACTIVE" },
  });
  if (!connector || connector.webhookSecret !== secret) {
    throw new ServerError("Invalid MES connector credentials.", "FORBIDDEN");
  }
  const existing = await prisma.integrationWebhookDelivery.findUnique({
    where: { tenantId_connectorId_idempotencyKey: { tenantId, connectorId: connector.id, idempotencyKey } },
  });
  if (existing) return { replayed: true };

  const user = await prisma.user.findFirst({ where: { tenantId, status: "ACTIVE" } });
  if (!user) throw new ServerError("Tenant has no active user for integration.", "INTERNAL");
  const { recordProductionOperationEvent } = await import("@/lib/server/production-operation-events");
  const ctx = { tenantId, userId: user.id, role: user.role };
  const event = await recordProductionOperationEvent(ctx, payload.productionOperationId, {
    eventType: payload.eventType,
    quantity: payload.quantity,
    reason: payload.reason,
  });
  await prisma.integrationWebhookDelivery.create({
    data: {
      tenantId,
      connectorId: connector.id,
      idempotencyKey,
      payload: event,
    },
  });
  return { replayed: false, event };
}
