import { PrismaClient } from "@prisma/client";

import { seedDemoTenantFoundation } from "./seed-foundation";
import { ensureApsDemoData } from "./seed-aps";

const prisma = new PrismaClient();

async function main() {
  await seedDemoTenantFoundation(prisma);
  await ensureApsDemoData(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
