import { PrismaClient } from "@prisma/client";

import { buildWorkCalendar, isWorkingAt } from "../src/lib/operations/calendar";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) {
    console.error("medicrest tenant missing");
    process.exit(1);
  }

  const workstations = await prisma.workstation.findMany({
    where: { tenantId: tenant.id, active: true },
    select: { id: true, code: true, capacityHoursPerDay: true },
  });
  const shifts = await prisma.workstationShift.findMany({ where: { tenantId: tenant.id } });
  const calendars = new Map(
    workstations.map((ws) => [
      ws.id,
      buildWorkCalendar({
        capacityHoursPerDay: ws.capacityHoursPerDay,
        shifts: shifts
          .filter((row) => row.workstationId === ws.id)
          .map((row) => ({
            weekday: row.weekday,
            startMinute: row.startMinute,
            endMinute: row.endMinute,
          })),
      }),
    ])
  );

  const ops = await prisma.productionOperation.findMany({
    where: {
      tenantId: tenant.id,
      plannedStart: { not: null },
      plannedEnd: { not: null },
      workstationId: { not: null },
    },
    select: {
      id: true,
      operationCode: true,
      plannedStart: true,
      plannedEnd: true,
      workstationId: true,
      productionOrder: { select: { orderNumber: true } },
    },
  });

  let violations = 0;
  for (const op of ops) {
    const code = workstations.find((row) => row.id === op.workstationId)?.code;
    if (code === "QC-HOLD") continue;
    const calendar = calendars.get(op.workstationId!);
    if (!calendar) continue;
    const startOk = isWorkingAt(op.plannedStart!, calendar);
    const endOk = isWorkingAt(new Date(op.plannedEnd!.getTime() - 60_000), calendar);
    if (!startOk || !endOk) {
      violations += 1;
      console.log(
        "Off-shift:",
        op.productionOrder.orderNumber,
        op.operationCode,
        code,
        op.plannedStart!.toISOString(),
        "→",
        op.plannedEnd!.toISOString()
      );
    }
  }

  console.log(`Checked ${ops.length} ops, ${violations} off-shift violations.`);
  process.exit(violations > 0 ? 1 : 0);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
