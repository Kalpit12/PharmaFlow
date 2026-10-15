import { PrismaClient } from "@prisma/client";

import { machineCodesForStep } from "../src/lib/operations/routing-resources";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) {
    console.log("No medicrest tenant");
    return;
  }

  const wsByCode = new Map(
    (await prisma.workstation.findMany({ where: { tenantId: tenant.id, active: true } })).map((row) => [
      row.code,
      row.id,
    ])
  );

  const ops = await prisma.productionOperation.findMany({
    where: {
      tenantId: tenant.id,
      OR: [{ plannedStart: null }, { plannedEnd: null }],
    },
    include: {
      productionOrder: { select: { orderNumber: true, batch: { select: { batchNumber: true } } } },
      routingOperation: { include: { resources: { include: { workstation: { select: { code: true } } } } } },
    },
    orderBy: [{ productionOrderId: "asc" }, { sequence: "asc" }],
  });

  console.log(`Unscheduled DB ops: ${ops.length}\n`);
  for (const op of ops) {
    const machines = machineCodesForStep(op.operationCode);
    const resourceCodes =
      op.routingOperation?.resources.map((row) => row.workstation.code).join(", ") || "(none)";
    const mapped = machines.filter((code) => wsByCode.has(code)).join(", ") || "(no machine in plant)";
    console.log(
      [
        op.productionOrder.batch?.batchNumber ?? op.productionOrder.orderNumber,
        op.operationCode,
        `resources=[${resourceCodes}]`,
        `map=[${mapped}]`,
      ].join(" · ")
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
