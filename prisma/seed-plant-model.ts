import type { PrismaClient } from "@prisma/client";

/** Nairobi demo plant structure for Phase 1 (MediCrest tenant). */
export async function ensurePlantModelDemoData(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) return;

  const existingSite = await prisma.plantSite.findFirst({ where: { tenantId: tenant.id, code: "NBO-PLT" } });
  if (existingSite) {
    await ensurePlantModelPhase11Seed(prisma, tenant.id);
    return;
  }

  const site = await prisma.plantSite.create({
    data: {
      tenantId: tenant.id,
      name: "Nairobi Plant",
      code: "NBO-PLT",
      timezone: "Africa/Nairobi",
    },
  });

  const oralSolid = await prisma.plantDepartment.create({
    data: { tenantId: tenant.id, siteId: site.id, name: "Oral solid", code: "OSD" },
  });
  const liquids = await prisma.plantDepartment.create({
    data: { tenantId: tenant.id, siteId: site.id, name: "Liquids", code: "LIQ" },
  });
  const packaging = await prisma.plantDepartment.create({
    data: { tenantId: tenant.id, siteId: site.id, name: "Packaging", code: "PKG" },
  });

  const granSuite = await prisma.plantRoom.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      departmentId: oralSolid.id,
      name: "Granulation suite",
      code: "GRN-SUITE",
      sharedCapacity: true,
    },
  });
  await prisma.plantRoom.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      departmentId: oralSolid.id,
      name: "Compression hall",
      code: "COMP-HALL",
      sharedCapacity: false,
    },
  });
  await prisma.plantRoom.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      departmentId: liquids.id,
      name: "Liquid filling",
      code: "LIQ-FILL",
      sharedCapacity: false,
    },
  });

  const tabletGroup = await prisma.workstationGroup.create({
    data: { tenantId: tenant.id, name: "Tablet lines", code: "TBL-GRP" },
  });
  const capsuleGroup = await prisma.workstationGroup.create({
    data: { tenantId: tenant.id, name: "Capsule lines", code: "CAP-GRP" },
  });
  const packGroup = await prisma.workstationGroup.create({
    data: { tenantId: tenant.id, name: "Packaging lines", code: "PKG-GRP" },
  });

  const codeMap: Record<string, { groupId: string; departmentId: string; roomId?: string }> = {
    TLA: { groupId: tabletGroup.id, departmentId: oralSolid.id },
    TLB: { groupId: tabletGroup.id, departmentId: oralSolid.id },
    CLA: { groupId: capsuleGroup.id, departmentId: oralSolid.id },
    LLA: { groupId: packGroup.id, departmentId: liquids.id },
    PLA: { groupId: packGroup.id, departmentId: packaging.id },
    PLB: { groupId: packGroup.id, departmentId: packaging.id },
  };

  const workstations = await prisma.workstation.findMany({ where: { tenantId: tenant.id } });
  for (const ws of workstations) {
    const map = codeMap[ws.code];
    if (!map) continue;
    await prisma.workstation.update({
      where: { id: ws.id },
      data: {
        siteId: site.id,
        departmentId: map.departmentId,
        roomId: map.roomId ?? (ws.code.startsWith("TL") ? granSuite.id : undefined),
        groupId: map.groupId,
        efficiencyCoefficient: 1,
        qualificationStatus: "QUALIFIED",
        cleanStatus: "CLEAN",
      },
    });
  }

  await ensurePlantModelPhase11Seed(prisma, tenant.id);
}

/** Personnel + sub-product demo rows (idempotent). */
export async function ensurePlantModelPhase11Seed(prisma: PrismaClient, tenantId: string) {
  const oralSolid = await prisma.plantDepartment.findFirst({
    where: { tenantId, code: "OSD" },
    select: { id: true },
  });

  const shiftA = await prisma.plantEmployeeGroup.upsert({
    where: { tenantId_code: { tenantId, code: "SHIFT-A" } },
    create: { tenantId, code: "SHIFT-A", name: "Morning shift pool" },
    update: {},
  });

  const operator = await prisma.plantEmployee.upsert({
    where: { tenantId_code: { tenantId, code: "OP-001" } },
    create: {
      tenantId,
      code: "OP-001",
      name: "Jane Wanjiku",
      departmentId: oralSolid?.id ?? null,
      status: "ACTIVE",
    },
    update: { name: "Jane Wanjiku", departmentId: oralSolid?.id ?? null, status: "ACTIVE" },
  });

  await prisma.plantEmployeeGroupMember.upsert({
    where: { groupId_employeeId: { groupId: shiftA.id, employeeId: operator.id } },
    create: { tenantId, groupId: shiftA.id, employeeId: operator.id },
    update: {},
  });

  await prisma.plantEmployeeOperationSkill.deleteMany({ where: { employeeId: operator.id } });
  for (const operationCode of ["GRAN", "COMP"]) {
    await prisma.plantEmployeeOperationSkill.create({
      data: { tenantId, employeeId: operator.id, operationCode },
    });
  }

  const parent = await prisma.product.findFirst({
    where: { tenantId, sku: { contains: "AMOX" } },
    select: { id: true, sku: true },
    orderBy: { sku: "asc" },
  });
  const component = await prisma.product.findFirst({
    where: { tenantId, sku: { contains: "GRAN" } },
    select: { id: true },
  });
  if (parent && component && parent.id !== component.id) {
    await prisma.productSubAssembly.upsert({
      where: {
        parentProductId_componentProductId: { parentProductId: parent.id, componentProductId: component.id },
      },
      create: {
        tenantId,
        parentProductId: parent.id,
        componentProductId: component.id,
        quantityPerBatch: 1,
        sequence: 10,
      },
      update: { quantityPerBatch: 1, sequence: 10 },
    });
  }
}
