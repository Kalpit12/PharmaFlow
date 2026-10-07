import { getPrisma } from "../src/lib/server/db";
import {
  acceptSchedulePlan,
  exportProductionSchedule,
  proposeRescheduleAll,
  simulateDeliveryDate,
} from "../src/lib/server/aps-plan";

async function main() {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id, role: "OPERATIONS" } })
    ?? (await prisma.user.findFirst({ where: { tenantId: tenant?.id } }));
  if (!tenant || !user) throw new Error("Missing demo tenant or user");
  const ctx = { tenantId: tenant.id, userId: user.id, role: user.role };

  const proposed = await proposeRescheduleAll(ctx, new Date().toISOString());
  if (proposed.status !== "PROPOSED" && proposed.status !== "ACCEPTED") {
    throw new Error(`Expected a proposed plan, got ${proposed.status}`);
  }
  if (proposed.orders.length < 1) throw new Error("Proposed plan has no orders");

  const accepted = proposed.status === "ACCEPTED" ? proposed : await acceptSchedulePlan(ctx, proposed.id);
  if (accepted.status !== "ACCEPTED") throw new Error("Accept did not persist ACCEPTED status");

  const scheduledOps = await prisma.productionOperation.count({
    where: { tenantId: tenant.id, plannedStart: { not: null } },
  });
  if (scheduledOps < 1) throw new Error("Accept did not write operation start times");

  const product = await prisma.product.findFirst({
    where: { tenantId: tenant.id, sku: "PARA-500-TAB" },
    select: { id: true },
  });
  if (product) {
    const simulation = await simulateDeliveryDate(ctx, {
      productId: product.id,
      quantity: 10000,
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
    });
    if (simulation.blocked && simulation.issues.length === 0) {
      throw new Error("Blocked delivery simulation should explain why");
    }
  }

  const exported = await exportProductionSchedule(ctx);
  if (exported.format !== "pharmora.production-schedule.v1") {
    throw new Error("Export contract missing");
  }
  if (exported.orders.length < 1) throw new Error("Export contained no orders");

  console.log(
    JSON.stringify({
      version: accepted.version,
      moved: accepted.movedOrders,
      locked: accepted.lockedOrders,
      scheduledOps,
      exported: exported.orders.length,
    })
  );
  console.log("APS propose/accept/delivery/export verification passed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
