import { PrismaClient } from "@prisma/client";

import { ensureGanttSkyPlannerDemoSeed } from "../prisma/seed-gantt-demo";

const prisma = new PrismaClient();

ensureGanttSkyPlannerDemoSeed(prisma)
  .then(() => {
    console.log("Gantt demo seed complete.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
