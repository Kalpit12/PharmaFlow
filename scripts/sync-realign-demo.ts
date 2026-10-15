import { PrismaClient } from "@prisma/client";

import { realignDemoScheduleToShifts } from "../prisma/realign-demo-schedule-to-shifts";
import { syncStandardDemoRoutings } from "../prisma/sync-demo-routings";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) {
    console.error("medicrest tenant not found — run db:seed first.");
    process.exit(1);
  }
  console.log("Syncing standard demo routings…");
  await syncStandardDemoRoutings(prisma, tenant.id);
  console.log("Realigning planned times to shift calendars…");
  const realigned = await realignDemoScheduleToShifts(prisma, tenant.id);
  console.log(`Done. Realigned ${realigned} operation(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
