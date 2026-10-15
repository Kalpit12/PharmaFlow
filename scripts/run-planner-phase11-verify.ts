import { PrismaClient } from "@prisma/client";

import { runPlannerPhase11Verify } from "../prisma/verify-planner-phase11";

const prisma = new PrismaClient();

runPlannerPhase11Verify(prisma)
  .then(() => {
    console.log("Planner Phase 11 DB verification passed.");
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
