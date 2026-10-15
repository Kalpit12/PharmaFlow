import { PrismaClient } from "@prisma/client";

import { resolveGanttWindow } from "../src/lib/operations/gantt-window";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) {
    console.log("No medicrest tenant");
    return;
  }

  const window = resolveGanttWindow({ zoom: "week" });
  console.log("Gantt window (default week):", window.start.toISOString(), "→", window.end.toISOString());

  const workstations = await prisma.workstation.findMany({
    where: { tenantId: tenant.id, active: true },
    select: { id: true, code: true, groupId: true },
    orderBy: { code: "asc" },
  });
  console.log("\nActive workstations:", workstations.length);
  const byCode = new Map(workstations.map((w) => [w.code, w.id]));

  const legacy = ["TLA", "TLB", "PLA", "PLB", "CLA", "LLA"];
  const machine = ["DISP", "GRN-1", "CMP-1", "BLST-A", "QC-HOLD"];

  const ops = await prisma.productionOperation.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      operationCode: true,
      sequence: true,
      plannedStart: true,
      plannedEnd: true,
      workstationId: true,
      productionOrder: { select: { orderNumber: true } },
    },
  });

  const wsIdToCode = new Map(workstations.map((w) => [w.id, w.code]));
  let withPlan = 0;
  let inWindow = 0;
  let onLegacy = 0;
  let onMachine = 0;
  let orphanWs = 0;

  for (const op of ops) {
    if (!op.plannedStart || !op.plannedEnd || !op.workstationId) continue;
    withPlan++;
    const code = wsIdToCode.get(op.workstationId);
    if (!code) orphanWs++;
    else if (legacy.includes(code)) onLegacy++;
    else if (machine.some((m) => code.startsWith(m.split("-")[0]) || code === m)) onMachine++;

    const start = op.plannedStart.getTime();
    const end = op.plannedEnd.getTime();
    if (end >= window.start.getTime() && start <= window.end.getTime()) inWindow++;
  }

  console.log("\nProduction operations:", ops.length);
  console.log("  With planned start/end + workstation:", withPlan);
  console.log("  Intersecting default gantt window:", inWindow);
  console.log("  On legacy line codes (TLA/PLB/…):", onLegacy);
  console.log("  On sample machine codes:", onMachine);
  console.log("  Unknown/inactive workstation id:", orphanWs);

  const sample = ops
    .filter((o) => o.plannedStart && o.workstationId)
    .slice(0, 8)
    .map((o) => ({
      order: o.productionOrder.orderNumber,
      step: o.operationCode,
      ws: wsIdToCode.get(o.workstationId!) ?? o.workstationId,
      start: o.plannedStart!.toISOString(),
    }));
  console.log("\nSample scheduled ops:", sample);

  const unscheduled = await prisma.productionOperation.count({
    where: { tenantId: tenant.id, OR: [{ plannedStart: null }, { plannedEnd: null }] },
  });
  console.log("\nOps missing planned times:", unscheduled);

  const legacyWs = await prisma.workstation.findMany({
    where: { tenantId: tenant.id, code: { in: legacy } },
    select: { code: true, active: true, groupId: true },
  });
  console.log("\nLegacy workstation rows:", legacyWs);

  const inWindowByCode = new Map<string, number>();
  for (const op of ops) {
    if (!op.plannedStart || !op.plannedEnd || !op.workstationId) continue;
    const end = op.plannedEnd.getTime();
    const start = op.plannedStart.getTime();
    if (end < window.start.getTime() || start > window.end.getTime()) continue;
    const code = wsIdToCode.get(op.workstationId) ?? "?";
    inWindowByCode.set(code, (inWindowByCode.get(code) ?? 0) + 1);
  }
  console.log("\nOps in gantt window by workstation:", [...inWindowByCode.entries()].sort());
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
