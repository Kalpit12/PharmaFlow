import { PrismaClient } from "@prisma/client";

import { LAB_ALLIED_DEMO_SLUG } from "../src/lib/demo-tenant";
import { getWorkstationRosterSnapshot } from "../src/lib/server/workstation-roster";

export async function printLabAlliedRosterWarnings(prisma: PrismaClient, tenantId: string, userId: string): Promise<number> {
  const ctx = { tenantId, userId, role: "MANAGER" as const };
  const snapshot = await getWorkstationRosterSnapshot(ctx);
  const wsCode = new Map(snapshot.workstations.map((row) => [row.id, row.code]));
  const rows: Array<{ chip: string; warnings: string[] }> = [];
  for (const chip of snapshot.assignments) {
    if (chip.warnings.length === 0) continue;
    rows.push({
      chip: `${chip.date} · ${wsCode.get(chip.workstationId) ?? "?"} · ${chip.employeeName ?? "Unassigned"} · ${chip.timeLabel}`,
      warnings: chip.warnings,
    });
  }
  console.log(`\n[roster] ${rows.length} chips with warnings`);
  for (const row of rows.slice(0, 40)) {
    console.log(`  ${row.chip}`);
    for (const w of row.warnings) console.log(`    - ${w}`);
  }
  if (rows.length > 40) console.log(`  … and ${rows.length - 40} more`);
  return rows.length;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: LAB_ALLIED_DEMO_SLUG } });
    const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id, status: "ACTIVE" } });
    if (!tenant || !user) throw new Error("Demo tenant or user missing");
    await printLabAlliedRosterWarnings(prisma, tenant.id, user.id);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes("list-lab-allied-roster-warnings")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
