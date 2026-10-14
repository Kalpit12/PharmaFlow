import assert from "node:assert/strict";

import { acceptSchedulePlan, proposeGanttOrderMove, proposeRescheduleAll } from "../src/lib/server/aps-plan";
import { getPrisma } from "../src/lib/server/db";

async function loadMovableOrder(tenantId: string) {
  const prisma = getPrisma();
  return prisma.productionOrder.findFirst({
    where: {
      tenantId,
      isLocked: false,
      status: { in: ["SCHEDULED", "AT_RISK"] },
      plannedStart: { not: null },
      operations: { some: {} },
    },
    include: {
      operations: {
        orderBy: { sequence: "asc" },
        include: { routingOperation: { include: { resources: true } } },
      },
    },
  });
}

async function main() {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id, role: "OPERATIONS" } })
    ?? (await prisma.user.findFirst({ where: { tenantId: tenant?.id } }));
  if (!tenant || !user) throw new Error("Missing demo tenant or user — run npm run db:seed && npm run db:seed-aps");
  const ctx = { tenantId: tenant.id, userId: user.id, role: user.role };

  let movable = await loadMovableOrder(tenant.id);
  if (!movable?.plannedStart) {
    await proposeRescheduleAll(ctx, new Date().toISOString());
    movable = await loadMovableOrder(tenant.id);
  }
  if (!movable?.plannedStart) throw new Error("No unlocked scheduled order available for Gantt move test");

  const first = movable.operations[0];
  if (!first) throw new Error("Order has no operations");
  const currentWs = first.workstationId ?? movable.workstationId;
  const alternate = first.routingOperation?.resources.find((resource) => resource.workstationId !== currentWs);
  const targetWs = alternate?.workstationId ?? currentWs;
  if (!targetWs) throw new Error("No qualified workstation for move");

  const proposedStart = new Date(movable.plannedStart.getTime() + 2 * 60 * 60_000);
  const beforeStart = movable.plannedStart.toISOString();

  const proposal = await proposeGanttOrderMove(ctx, {
    orderId: movable.id,
    workstationId: targetWs,
    proposedStart: proposedStart.toISOString(),
  });
  assert.equal(proposal.status, "PROPOSED", "Gantt move must create a PROPOSED plan");
  assert.ok(proposal.orders.length >= 1, "Proposal must include order rows");
  const row = proposal.orders.find((entry) => entry.orderNumber === movable.orderNumber);
  assert.ok(row, "Moved order must appear in proposal");

  const accepted = await acceptSchedulePlan(ctx, proposal.id);
  assert.equal(accepted.status, "ACCEPTED");

  const after = await prisma.productionOrder.findUnique({ where: { id: movable.id } });
  assert.ok(after?.plannedStart, "Accepted move must persist planned start");
  const startDeltaMinutes = Math.abs(after.plannedStart!.getTime() - movable.plannedStart!.getTime()) / 60_000;
  const workstationChanged = after.workstationId === targetWs && after.workstationId !== movable.workstationId;
  assert.ok(
    startDeltaMinutes >= 90 || workstationChanged,
    "Gantt move should shift planned start by ~2h or move to an alternate workstation"
  );

  console.log(
    JSON.stringify({
      orderNumber: movable.orderNumber,
      beforeStart,
      afterStart: after.plannedStart.toISOString(),
      startDeltaMinutes: Math.round(startDeltaMinutes),
      targetWorkstationId: targetWs,
      afterWorkstationId: after.workstationId,
      planVersion: accepted.version,
      movedOrders: accepted.movedOrders,
      proposalChangeMinutes: row?.changeMinutes ?? 0,
    })
  );
  console.log("Operations Gantt propose-move verification passed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
