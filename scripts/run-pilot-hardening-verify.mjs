import { PrismaClient } from "@prisma/client";
import { runPilotHardeningVerify } from "../prisma/verify-pilot-hardening.ts";

const prisma = new PrismaClient();
try {
  await runPilotHardeningVerify(prisma);
} finally {
  await prisma.$disconnect();
}
