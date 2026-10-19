import { readdirSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const local = readdirSync(join(process.cwd(), "prisma", "migrations"))
      .filter((name) => /^\d/.test(name))
      .sort();
    const applied = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY migration_name
    `;
    const appliedSet = new Set(applied.map((row) => row.migration_name));
    const missing = local.filter((name) => !appliedSet.has(name));
    const extra = [...appliedSet].filter((name) => !local.includes(name)).sort();

    console.log(`Local migrations: ${local.length}`);
    console.log(`Applied in DB: ${appliedSet.size}`);
    if (missing.length) {
      console.error("\nMissing on database (run: npx prisma migrate deploy):");
      for (const name of missing) console.error(`  - ${name}`);
    }
    if (extra.length) {
      console.warn("\nApplied in DB but not in repo:");
      for (const name of extra) console.warn(`  - ${name}`);
    }

    console.log("\nColumn probe:");
    await prisma.$queryRaw`SELECT "hazardClass" FROM "Product" LIMIT 1`;
    await prisma.$queryRaw`SELECT "dedicatedTo" FROM "Workstation" LIMIT 1`;
    await prisma.$queryRaw`SELECT 1 FROM "WorkstationRosterAssignment" LIMIT 1`;
    console.log("  hazardClass, dedicatedTo, WorkstationRosterAssignment — OK");

    if (missing.length) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
