import assert from "node:assert/strict";

import { getOrCreatePlanningPolicy, updatePlanningPolicy } from "../src/lib/server/aps-plan";
import { getPrisma } from "../src/lib/server/db";
import { recordProductionOperationEvent } from "../src/lib/server/production-operation-events";

async function main() {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id, role: "OPERATIONS" } })
    ?? (await prisma.user.findFirst({ where: { tenantId: tenant?.id } }));
  if (!tenant || !user) throw new Error("Missing demo tenant or user");
  const ctx = { tenantId: tenant.id, userId: user.id, role: user.role };

  const prior = await getOrCreatePlanningPolicy(ctx);
  await updatePlanningPolicy(ctx, { autopilotMode: "PROPOSE_ONLY" });

  const operation = await prisma.productionOperation.findFirst({
    where: { tenantId: tenant.id, status: { in: ["SCHEDULED", "IN_PROGRESS", "UNSCHEDULED"] } },
    orderBy: { sequence: "asc" },
  });
  if (!operation) throw new Error("No production operation for shop-floor test");

  const plansBefore = await prisma.schedulePlan.count({
    where: { tenantId: tenant.id, status: "PROPOSED" },
  });

  await recordProductionOperationEvent(ctx, operation.id, {
    eventType: "DOWNTIME",
    reason: "verify-script: filler blockage on line",
  });

  const trigger = await prisma.planningEvent.findFirst({
    where: { tenantId: tenant.id, eventType: "SHOP_FLOOR_TRIGGERED" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(trigger, "Shop-floor downtime must emit SHOP_FLOOR_TRIGGERED planning event");

  const plansAfter = await prisma.schedulePlan.count({
    where: { tenantId: tenant.id, status: "PROPOSED" },
  });
  assert.ok(plansAfter >= plansBefore, "Shop-floor replan should create or retain a PROPOSED plan");

  const active = await prisma.schedulePlan.findFirst({
    where: { tenantId: tenant.id, status: "PROPOSED" },
    orderBy: { version: "desc" },
  });
  assert.ok(active, "An active PROPOSED plan must exist after shop-floor trigger");

  if (prior.autopilotMode !== "PROPOSE_ONLY") {
    await updatePlanningPolicy(ctx, { autopilotMode: prior.autopilotMode });
  }

  console.log(
    JSON.stringify({
      operationId: operation.id,
      planningEventId: trigger.id,
      proposedPlanVersion: active.version,
      proposedPlanStatus: active.status,
    })
  );
  console.log("Operations shop-floor replan verification passed.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
