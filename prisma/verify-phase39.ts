import type { PrismaClient } from "@prisma/client";

export async function runPhase39Verify(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) throw new Error("Missing demo tenant medicrest");

  const policy = await prisma.planningPolicy.findUnique({ where: { tenantId: tenant.id } });
  if (!policy) throw new Error("Lab & Allied is missing a planning policy");
  if (policy.freezeMinutes < 0) throw new Error("Freeze horizon must be zero or positive");

  const shifts = await prisma.workstationShift.count({ where: { tenantId: tenant.id } });
  if (shifts < 5) throw new Error("Expected persisted Mon–Fri workstation shifts");

  const shutdowns = await prisma.workstationCalendarException.count({
    where: { tenantId: tenant.id, reason: { contains: "Mashujaa" } },
  });
  if (shutdowns < 1) throw new Error("Expected Mashujaa Day calendar exceptions");

  const routings = await prisma.productRouting.count({ where: { tenantId: tenant.id, active: true } });
  if (routings < 1) throw new Error("Expected active product routings");

  const operations = await prisma.productionOperation.count({ where: { tenantId: tenant.id } });
  if (operations < 1) throw new Error("Expected instantiated production operations");
}
