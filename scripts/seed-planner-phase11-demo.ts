import { PrismaClient } from "@prisma/client";

import { ensurePlantModelPhase11Seed } from "../prisma/seed-plant-model";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) throw new Error("Missing medicrest tenant");
  await ensurePlantModelPhase11Seed(prisma, tenant.id);
  console.log("Phase 11 demo personnel/sub-assembly seed OK");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
