import { PrismaClient } from "@prisma/client";

import { ensureApsDemoData } from "./seed-aps";
import { ensureVerifyPrerequisites } from "./ensure-verify-prerequisites";
import { seedDemoTenantFoundation } from "./seed-foundation";

const prisma = new PrismaClient();

async function main() {
  await seedDemoTenantFoundation(prisma);
  await ensureApsDemoData(prisma);
  await ensureVerifyPrerequisites(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
