import { PrismaClient } from "@prisma/client";

import { ensureVerifyPrerequisites } from "../prisma/ensure-verify-prerequisites";

const prisma = new PrismaClient();

ensureVerifyPrerequisites(prisma)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
