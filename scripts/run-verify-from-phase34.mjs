import { createVerifyPrisma } from "../prisma/verify-db.ts";
import { runPhase34Verify } from "../prisma/verify-phase34.ts";
import { runPhase35Verify } from "../prisma/verify-phase35.ts";
import { runPhase36Verify } from "../prisma/verify-phase36.ts";
import { runPhase37Verify } from "../prisma/verify-phase37.ts";
import { runPhase38Verify } from "../prisma/verify-phase38.ts";
import { runPhase39Verify } from "../prisma/verify-phase39.ts";
import { runPilotHardeningVerify } from "../prisma/verify-pilot-hardening.ts";

const prisma = createVerifyPrisma();
try {
  await runPhase34Verify(prisma);
  console.log("Phase 34 verification passed.");
  await runPhase35Verify(prisma);
  console.log("Phase 35 verification passed.");
  await runPhase36Verify(prisma);
  console.log("Phase 36 verification passed.");
  await runPhase37Verify(prisma);
  console.log("Phase 37 verification passed.");
  await runPhase38Verify(prisma);
  console.log("Phase 38 verification passed.");
  await runPhase39Verify(prisma);
  console.log("Phase 39 verification passed.");
  await runPilotHardeningVerify(prisma);
} finally {
  await prisma.$disconnect();
}
