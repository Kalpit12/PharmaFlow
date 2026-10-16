import { PrismaClient } from "@prisma/client";

import { ensureLabAlliedDemoSeed } from "./seed-lab-allied-demo";

const prisma = new PrismaClient();

ensureLabAlliedDemoSeed(prisma)
  .then(() => console.log("Laboratory & Allied (demo) tenant is ready."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
