import { PrismaClient } from "@prisma/client";

import { runPhase28Verify } from "../prisma/verify-phase28";

const prisma = new PrismaClient();
runPhase28Verify(prisma)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
