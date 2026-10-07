import { PrismaClient } from "@prisma/client";

import { ensureApsDemoData } from "./seed-aps";

const prisma = new PrismaClient();

ensureApsDemoData(prisma)
  .then(() => {
    console.log("APS routing demo data is ready.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
