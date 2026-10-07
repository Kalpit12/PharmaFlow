import { PrismaClient } from "@prisma/client";

import { runPhase39Verify } from "../prisma/verify-phase39";

const prisma = new PrismaClient();

runPhase39Verify(prisma)
  .then(() => {
    console.log("Phase 39 APS persistence verification passed.");
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
