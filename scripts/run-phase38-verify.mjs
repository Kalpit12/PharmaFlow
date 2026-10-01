import { PrismaClient } from "@prisma/client";
import { runPhase38Verify } from "../prisma/verify-phase38";

const prisma = new PrismaClient();
try {
  await runPhase38Verify(prisma);
  console.log("Phase 38 verify: PASS");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
