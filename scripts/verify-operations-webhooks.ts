import assert from "node:assert/strict";

import { processMesWebhook, processSapWebhook } from "../src/lib/server/integrations/connector-service";
import { getPrisma } from "../src/lib/server/db";

async function main() {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) throw new Error("Missing medicrest tenant");

  const sapKey = `verify-sap-${Date.now()}`;
  const sap = await processSapWebhook(tenant.id, "demo-sap-b1-secret", sapKey, {
    orders: [
      {
        orderNumber: `WH-PO-${Date.now()}`,
        sku: "PARA-500-TAB",
        quantity: 500,
        dueDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        priority: "NORMAL",
      },
    ],
  });
  assert.equal(sap.replayed, false);
  assert.ok(sap.result && typeof sap.result === "object" && "imported" in sap.result);

  const sapReplay = await processSapWebhook(tenant.id, "demo-sap-b1-secret", sapKey, { orders: [] });
  assert.equal(sapReplay.replayed, true);

  const operation = await prisma.productionOperation.findFirst({ where: { tenantId: tenant.id } });
  if (!operation) throw new Error("No operation for MES webhook test");

  const mesKey = `verify-mes-${Date.now()}`;
  const mes = await processMesWebhook(tenant.id, "demo-mes-secret", mesKey, {
    productionOperationId: operation.id,
    eventType: "DOWNTIME",
    reason: "verify-script: MES bridge downtime",
  });
  assert.equal(mes.replayed, false);
  assert.ok(mes.event);

  const mesReplay = await processMesWebhook(tenant.id, "demo-mes-secret", mesKey, {
    productionOperationId: operation.id,
    eventType: "DOWNTIME",
    reason: "duplicate",
  });
  assert.equal(mesReplay.replayed, true);

  const syncRuns = await prisma.integrationSyncRun.count({ where: { tenantId: tenant.id } });
  assert.ok(syncRuns >= 1, "Webhook processing should record integration sync runs");

  console.log(
    JSON.stringify({
      sapImported: (sap.result as { imported?: number }).imported ?? null,
      mesEventType: mes.event?.eventType ?? null,
      syncRuns,
    })
  );
  console.log("Operations SAP/MES webhook verification passed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
