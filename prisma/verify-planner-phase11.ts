import type { PrismaClient } from "@prisma/client";

export async function runPlannerPhase11Verify(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) throw new Error("Missing demo tenant medicrest");

  const employee = await prisma.plantEmployee.findFirst({ where: { tenantId: tenant.id, code: "OP-001" } });
  if (!employee) throw new Error("Expected demo plant employee OP-001 — run seed / migration 20261015160000");

  const skills = await prisma.plantEmployeeOperationSkill.count({ where: { employeeId: employee.id } });
  if (skills < 1) throw new Error("Expected operation skills on demo operator");

  const group = await prisma.plantEmployeeGroup.findFirst({ where: { tenantId: tenant.id, code: "SHIFT-A" } });
  if (!group) throw new Error("Expected demo employee group SHIFT-A");
}
