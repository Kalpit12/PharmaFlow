import type { PrismaClient } from "@prisma/client";

/** Legacy demo line codes superseded by machine-level workstations on the Gantt. */
export const LEGACY_LINE_CODES = ["TLA", "TLB", "PLA", "PLB", "CLA", "LLA"] as const;

const OP_TO_MACHINES: Record<string, string[]> = {
  DISP: ["DISP"],
  DISPENSE: ["DISP"],
  GRAN: ["GRN-1", "GRN-2"],
  BLEND: ["BLND"],
  DRY: ["FBD"],
  FBD: ["FBD"],
  COMP: ["CMP-1", "CMP-2", "CMP-3"],
  COMPRESS: ["CMP-1", "CMP-2", "CMP-3"],
  COAT: ["COAT"],
  ENC: ["ENC"],
  ENCAPSULATE: ["ENC"],
  PACK: ["BLST-A", "BLST-B"],
  COMPOUND: ["COMPOUND-1"],
  FILL: ["LIQ-FILL"],
  QC: ["QC-HOLD"],
  "QC-HOLD": ["QC-HOLD"],
};

function pickMachine(code: string, orderKey: string, machines: Map<string, string>): string | null {
  const normalized = code.toUpperCase().replace(/\s+/g, "");
  const candidates =
    OP_TO_MACHINES[normalized] ??
    OP_TO_MACHINES[normalized.replace(/ING$/i, "")] ??
    (normalized.includes("PACK") ? OP_TO_MACHINES.PACK : undefined) ??
    (normalized.includes("COMP") ? OP_TO_MACHINES.COMPRESS : undefined);
  if (!candidates?.length) return null;
  const index = Math.abs(hashString(orderKey)) % candidates.length;
  const targetCode = candidates[index];
  return machines.get(targetCode) ?? null;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return hash;
}

export type MigrateGanttWorkstationsReport = {
  operationsRemapped: number;
  ordersRemapped: number;
  routingResourcesRemapped: number;
  legacyDeactivated: number;
};

/**
 * Moves production data off legacy line workstations (TLA, PLB, …) onto machine codes (GRN-1, CMP-1, …).
 * Idempotent: only remaps rows still pointing at legacy workstation ids.
 */
export async function migrateLegacyWorkstationsToMachines(
  prisma: PrismaClient,
  tenantId: string
): Promise<MigrateGanttWorkstationsReport> {
  const report: MigrateGanttWorkstationsReport = {
    operationsRemapped: 0,
    ordersRemapped: 0,
    routingResourcesRemapped: 0,
    legacyDeactivated: 0,
  };

  const workstations = await prisma.workstation.findMany({
    where: { tenantId, active: true },
    select: { id: true, code: true },
  });
  const byCode = new Map(workstations.map((row) => [row.code, row.id]));
  const legacyIds = new Set(
    workstations.filter((row) => LEGACY_LINE_CODES.includes(row.code as (typeof LEGACY_LINE_CODES)[number])).map((row) => row.id)
  );
  if (legacyIds.size === 0) return report;

  const ops = await prisma.productionOperation.findMany({
    where: { tenantId, workstationId: { in: [...legacyIds] } },
    select: { id: true, operationCode: true, productionOrderId: true, workstationId: true },
  });

  for (const op of ops) {
    const nextId = pickMachine(op.operationCode, op.productionOrderId, byCode);
    if (!nextId || nextId === op.workstationId) continue;
    await prisma.productionOperation.update({
      where: { id: op.id },
      data: { workstationId: nextId },
    });
    report.operationsRemapped += 1;
  }

  const orders = await prisma.productionOrder.findMany({
    where: { tenantId, workstationId: { in: [...legacyIds] } },
    select: { id: true, orderNumber: true, workstationId: true },
  });
  for (const order of orders) {
    const anchor = await prisma.productionOperation.findFirst({
      where: { productionOrderId: order.id, workstationId: { not: null } },
      orderBy: { sequence: "asc" },
      select: { workstationId: true, operationCode: true },
    });
    const nextId =
      anchor?.workstationId && !legacyIds.has(anchor.workstationId)
        ? anchor.workstationId
        : pickMachine(anchor?.operationCode ?? "PACK", order.id, byCode);
    if (!nextId) continue;
    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { workstationId: nextId },
    });
    report.ordersRemapped += 1;
  }

  const resources = await prisma.routingOperationResource.findMany({
    where: { tenantId, workstationId: { in: [...legacyIds] } },
    include: { routingOperation: { select: { code: true, routingId: true } } },
  });
  for (const resource of resources) {
    const nextId = pickMachine(resource.routingOperation.code, resource.routingOperation.routingId, byCode);
    if (!nextId || nextId === resource.workstationId) continue;
    const duplicate = await prisma.routingOperationResource.findFirst({
      where: { routingOperationId: resource.routingOperationId, workstationId: nextId },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== resource.id) {
      await prisma.routingOperationResource.delete({ where: { id: resource.id } });
    } else {
      await prisma.routingOperationResource.update({
        where: { id: resource.id },
        data: { workstationId: nextId },
      });
    }
    report.routingResourcesRemapped += 1;
  }

  const deactivated = await prisma.workstation.updateMany({
    where: { tenantId, code: { in: [...LEGACY_LINE_CODES] } },
    data: { active: false },
  });
  report.legacyDeactivated = deactivated.count;

  return report;
}
