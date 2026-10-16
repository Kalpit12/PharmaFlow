import { PrismaClient } from "@prisma/client";

import { applyPlantShiftTemplate } from "./apply-plant-shift-template";

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await applyPlantShiftTemplate(prisma, "medicrest");
    console.log(`[medicrest] Shifts 08:30–17:30 / 19:00–06:00 on ${result.workstations} lines; realigned ${result.realigned} ops.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
