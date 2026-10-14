import assert from "node:assert/strict";

import { getPrisma } from "../src/lib/server/db";
import { importProductionOrders } from "../src/lib/server/aps-plan";

async function main() {
  const prisma = getPrisma();
  let tenant;
  try {
    tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  } catch {
    console.log("Skipping integration idempotency test — database unavailable.");
    return;
  }
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id, role: "OPERATIONS" } })
    ?? (await prisma.user.findFirst({ where: { tenantId: tenant?.id } }));
  if (!tenant || !user) {
    console.log("Skipping integration idempotency test — demo tenant not seeded.");
    return;
  }
  const ctx = { tenantId: tenant.id, userId: user.id, role: user.role };
  const product = await prisma.product.findFirst({
    where: { tenantId: tenant.id, sku: "PARA-500-TAB" },
    select: { sku: true },
  });
  if (!product) {
    console.log("Skipping integration idempotency test — demo product missing.");
    return;
  }

  const key = `verify-import-${Date.now()}`;
  const dueDate = new Date(Date.now() + 21 * 86_400_000).toISOString();
  const first = await importProductionOrders(
    ctx,
    [{ sku: product.sku, quantity: 1000, dueDate, orderNumber: `INT-${Date.now()}` }],
    { idempotencyKey: key }
  );
  const second = await importProductionOrders(
    ctx,
    [{ sku: product.sku, quantity: 1000, dueDate, orderNumber: `INT-${Date.now()}-dup` }],
    { idempotencyKey: key }
  );
  assert.deepEqual(second, first, "Duplicate idempotency key returns cached import result");
  console.log("Operations integration idempotency verification passed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
