import { requirePermission } from "@/lib/auth/authorization";
import { buildRoutingDagEdges, type RoutingDagEdge, type RoutingDagNode } from "@/lib/operations/routing-dag-layout";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";

export type PlantRoutingGraph = {
  routingId: string;
  productSku: string;
  productName: string;
  nodes: RoutingDagNode[];
  edges: RoutingDagEdge[];
};

export type PlantModelSnapshot = {
  phase: 11;
  sites: Array<{ id: string; name: string; code: string; timezone: string; departmentCount: number; roomCount: number }>;
  departments: Array<{ id: string; siteCode: string; name: string; code: string }>;
  rooms: Array<{ id: string; siteCode: string; departmentCode: string | null; name: string; code: string; sharedCapacity: boolean }>;
  groups: Array<{ id: string; name: string; code: string; workstationCount: number }>;
  workstations: Array<{
    id: string;
    code: string;
    name: string;
    kind: string;
    active: boolean;
    capacityHoursPerDay: number;
    siteCode: string | null;
    departmentCode: string | null;
    roomCode: string | null;
    groupCode: string | null;
    efficiencyCoefficient: number;
    qualificationStatus: string;
    cleanStatus: string;
    allowedParallelJobs: number;
    shiftCount: number;
    exceptionCount: number;
  }>;
  tools: Array<{ id: string; code: string; name: string; broken: boolean; workstationCodes: string[] }>;
  routings: Array<{
    id: string;
    productName: string;
    productSku: string;
    name: string;
    version: number;
    active: boolean;
    stepCount: number;
    dependencyCount: number;
  }>;
  changeoverRules: Array<{
    id: string;
    workstationCode: string | null;
    fromFamily: string;
    toFamily: string;
    durationMinutes: number;
    level: string;
    maxCampaignBatches: number | null;
  }>;
  employees: Array<{
    id: string;
    code: string;
    name: string;
    departmentCode: string | null;
    status: string;
    groupCodes: string[];
    skillCodes: string[];
  }>;
  subAssemblies: Array<{
    id: string;
    parentSku: string;
    parentName: string;
    componentSku: string;
    componentName: string;
    quantityPerBatch: number;
    sequence: number;
  }>;
  routingGraphs: PlantRoutingGraph[];
  counts: {
    sites: number;
    workstations: number;
    activeRoutings: number;
    changeoverRules: number;
    tools: number;
    employees: number;
    subAssemblies: number;
  };
};

export async function getPlantModelSnapshot(ctx: TenantContext): Promise<PlantModelSnapshot> {
  requirePermission(ctx, "production.read");

  const prisma = getPrisma();
  const [
    sites,
    departments,
    rooms,
    groups,
    workstations,
    tools,
    routings,
    changeoverRules,
    employees,
    subAssemblies,
  ] = await Promise.all([
    prisma.plantSite.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { code: "asc" } }),
    prisma.plantDepartment.findMany({
      where: { tenantId: ctx.tenantId },
      include: { site: { select: { code: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.plantRoom.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        site: { select: { code: true } },
        department: { select: { code: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.workstationGroup.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { code: "asc" } }),
    prisma.workstation.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        site: { select: { code: true } },
        department: { select: { code: true } },
        room: { select: { code: true } },
        group: { select: { code: true } },
        _count: { select: { shifts: true, calendarExceptions: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.productionTool.findMany({
      where: { tenantId: ctx.tenantId },
      include: { workstations: { include: { workstation: { select: { code: true } } } } },
      orderBy: { code: "asc" },
    }),
    prisma.productRouting.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      include: {
        product: { select: { name: true, sku: true } },
        operations: {
          select: {
            id: true,
            dependenciesFrom: { select: { id: true } },
          },
        },
      },
      orderBy: [{ productId: "asc" }, { version: "desc" }],
    }),
    prisma.changeoverRule.findMany({
      where: { tenantId: ctx.tenantId },
      include: { workstation: { select: { code: true } } },
      orderBy: { fromFamily: "asc" },
    }),
    prisma.plantEmployee.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        department: { select: { code: true } },
        groupLinks: { include: { group: { select: { code: true } } } },
        skills: { select: { operationCode: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.productSubAssembly.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        parentProduct: { select: { sku: true, name: true } },
        componentProduct: { select: { sku: true, name: true } },
      },
      orderBy: [{ parentProductId: "asc" }, { sequence: "asc" }],
    }),
  ]);

  const deptCountBySite = new Map<string, number>();
  for (const row of departments) {
    deptCountBySite.set(row.siteId, (deptCountBySite.get(row.siteId) ?? 0) + 1);
  }
  const roomCountBySite = new Map<string, number>();
  for (const row of rooms) {
    roomCountBySite.set(row.siteId, (roomCountBySite.get(row.siteId) ?? 0) + 1);
  }
  const wsCountByGroup = new Map<string, number>();
  for (const row of workstations) {
    if (row.groupId) wsCountByGroup.set(row.groupId, (wsCountByGroup.get(row.groupId) ?? 0) + 1);
  }

  const routingGraphs: PlantRoutingGraph[] = [];
  for (const routing of routings.slice(0, 6)) {
    const operations = await prisma.routingOperation.findMany({
      where: { tenantId: ctx.tenantId, routingId: routing.id },
      orderBy: { sequence: "asc" },
      include: { dependenciesFrom: { select: { toOperationId: true } } },
    });
    const nodes: RoutingDagNode[] = operations.map((op) => ({
      id: op.id,
      code: op.code,
      name: op.name,
      sequence: op.sequence,
      isQcHold: op.isQcHold,
    }));
    routingGraphs.push({
      routingId: routing.id,
      productSku: routing.product.sku,
      productName: routing.product.name,
      nodes,
      edges: buildRoutingDagEdges(operations),
    });
  }

  const routingSeen = new Set<string>();
  const routingRows = [];
  for (const routing of routings) {
    if (routingSeen.has(routing.productId)) continue;
    routingSeen.add(routing.productId);
    const dependencyCount = routing.operations.reduce((sum, op) => sum + op.dependenciesFrom.length, 0);
    routingRows.push({
      id: routing.id,
      productName: routing.product.name,
      productSku: routing.product.sku,
      name: routing.name,
      version: routing.version,
      active: routing.active,
      stepCount: routing.operations.length,
      dependencyCount,
    });
  }

  return {
    phase: 11,
    sites: sites.map((site) => ({
      id: site.id,
      name: site.name,
      code: site.code,
      timezone: site.timezone,
      departmentCount: deptCountBySite.get(site.id) ?? 0,
      roomCount: roomCountBySite.get(site.id) ?? 0,
    })),
    departments: departments.map((row) => ({
      id: row.id,
      siteCode: row.site.code,
      name: row.name,
      code: row.code,
    })),
    rooms: rooms.map((row) => ({
      id: row.id,
      siteCode: row.site.code,
      departmentCode: row.department?.code ?? null,
      name: row.name,
      code: row.code,
      sharedCapacity: row.sharedCapacity,
    })),
    groups: groups.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      workstationCount: wsCountByGroup.get(row.id) ?? 0,
    })),
    workstations: workstations.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      active: row.active,
      capacityHoursPerDay: row.capacityHoursPerDay,
      siteCode: row.site?.code ?? null,
      departmentCode: row.department?.code ?? null,
      roomCode: row.room?.code ?? null,
      groupCode: row.group?.code ?? null,
      efficiencyCoefficient: Number(row.efficiencyCoefficient),
      qualificationStatus: row.qualificationStatus,
      cleanStatus: row.cleanStatus,
      allowedParallelJobs: row.allowedParallelJobs,
      shiftCount: row._count.shifts,
      exceptionCount: row._count.calendarExceptions,
    })),
    tools: tools.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      broken: row.broken,
      workstationCodes: row.workstations.map((link) => link.workstation.code),
    })),
    routings: routingRows,
    changeoverRules: changeoverRules.map((row) => ({
      id: row.id,
      workstationCode: row.workstation?.code ?? null,
      fromFamily: row.fromFamily,
      toFamily: row.toFamily,
      durationMinutes: row.durationMinutes,
      level: row.level,
      maxCampaignBatches: row.maxCampaignBatches,
    })),
    employees: employees.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      departmentCode: row.department?.code ?? null,
      status: row.status,
      groupCodes: row.groupLinks.map((link) => link.group.code),
      skillCodes: row.skills.map((skill) => skill.operationCode),
    })),
    subAssemblies: subAssemblies.map((row) => ({
      id: row.id,
      parentSku: row.parentProduct.sku,
      parentName: row.parentProduct.name,
      componentSku: row.componentProduct.sku,
      componentName: row.componentProduct.name,
      quantityPerBatch: Number(row.quantityPerBatch),
      sequence: row.sequence,
    })),
    routingGraphs,
    counts: {
      sites: sites.length,
      workstations: workstations.filter((row) => row.active).length,
      activeRoutings: routingRows.length,
      changeoverRules: changeoverRules.length,
      tools: tools.length,
      employees: employees.length,
      subAssemblies: subAssemblies.length,
    },
  };
}
