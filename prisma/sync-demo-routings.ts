import type { PrismaClient } from "@prisma/client";

import { machineCodesForStep } from "../src/lib/operations/routing-resources";

type RouteOp = {
  code: string;
  name: string;
  runMinutes: number;
  setupMinutes: number;
  teardownMinutes: number;
  isQcHold?: boolean;
};

type RouteTemplate = {
  skus: string[];
  name: string;
  family: string;
  operations: RouteOp[];
};

export const STANDARD_DEMO_ROUTES: RouteTemplate[] = [
  {
    skus: ["PARA-500-TAB", "AZITH-500-TAB"],
    name: "Tablet manufacture and pack",
    family: "GENERAL_TABLET",
    operations: [
      { code: "DISP", name: "Dispensing", runMinutes: 90, setupMinutes: 45, teardownMinutes: 15 },
      { code: "GRAN", name: "Granulation", runMinutes: 180, setupMinutes: 60, teardownMinutes: 30 },
      { code: "FBD", name: "FBD drying", runMinutes: 120, setupMinutes: 30, teardownMinutes: 20 },
      { code: "BLND", name: "Blending", runMinutes: 90, setupMinutes: 30, teardownMinutes: 15 },
      { code: "COMP", name: "Compression", runMinutes: 240, setupMinutes: 45, teardownMinutes: 20 },
      { code: "QC-HOLD", name: "QC hold", runMinutes: 120, setupMinutes: 0, teardownMinutes: 0, isQcHold: true },
      { code: "PACK", name: "Blister packing", runMinutes: 150, setupMinutes: 35, teardownMinutes: 15 },
    ],
  },
  {
    skus: ["FERRO-FOLIC-TAB"],
    name: "Coated tablet manufacture and pack",
    family: "GENERAL_TABLET",
    operations: [
      { code: "DISP", name: "Dispensing", runMinutes: 90, setupMinutes: 45, teardownMinutes: 15 },
      { code: "BLND", name: "Blending", runMinutes: 120, setupMinutes: 40, teardownMinutes: 20 },
      { code: "COMP", name: "Compression", runMinutes: 200, setupMinutes: 40, teardownMinutes: 20 },
      { code: "COAT", name: "Coating", runMinutes: 180, setupMinutes: 45, teardownMinutes: 20 },
      { code: "QC-HOLD", name: "QC hold", runMinutes: 120, setupMinutes: 0, teardownMinutes: 0, isQcHold: true },
      { code: "PACK", name: "Blister packing", runMinutes: 120, setupMinutes: 30, teardownMinutes: 15 },
    ],
  },
  {
    skus: ["AMOX-500-CAP"],
    name: "Capsule manufacture and pack",
    family: "BETA_LACTAM",
    operations: [
      { code: "DISP", name: "Dispensing", runMinutes: 75, setupMinutes: 45, teardownMinutes: 15 },
      { code: "BLND", name: "Blending", runMinutes: 120, setupMinutes: 40, teardownMinutes: 20 },
      { code: "ENC", name: "Encapsulation", runMinutes: 360, setupMinutes: 90, teardownMinutes: 60 },
      { code: "QC-HOLD", name: "QC hold", runMinutes: 120, setupMinutes: 0, teardownMinutes: 0, isQcHold: true },
      { code: "PACK", name: "Blister packing", runMinutes: 180, setupMinutes: 45, teardownMinutes: 30 },
    ],
  },
  {
    skus: ["COUGH-SYR-100"],
    name: "Liquid manufacture, fill and pack",
    family: "LIQUID",
    operations: [
      { code: "DISP", name: "Dispensing", runMinutes: 60, setupMinutes: 30, teardownMinutes: 15 },
      { code: "COMPOUND", name: "Compounding", runMinutes: 300, setupMinutes: 60, teardownMinutes: 45 },
      { code: "FILL", name: "Liquid filling", runMinutes: 240, setupMinutes: 45, teardownMinutes: 30 },
      { code: "QC-HOLD", name: "QC hold", runMinutes: 90, setupMinutes: 0, teardownMinutes: 0, isQcHold: true },
      { code: "PACK", name: "Secondary packing", runMinutes: 120, setupMinutes: 20, teardownMinutes: 15 },
    ],
  },
];

export async function syncStandardDemoRoutings(prisma: PrismaClient, tenantId: string): Promise<void> {
  const workstations = await prisma.workstation.findMany({
    where: { tenantId, active: true },
    select: { id: true, code: true },
  });
  const wsByCode = new Map(workstations.map((row) => [row.code, row.id]));
  const products = await prisma.product.findMany({
    where: { tenantId, sku: { in: STANDARD_DEMO_ROUTES.flatMap((row) => row.skus) } },
    select: { id: true, sku: true },
  });
  const productBySku = new Map(products.map((row) => [row.sku, row.id]));

  for (const template of STANDARD_DEMO_ROUTES) {
    for (const sku of template.skus) {
      const productId = productBySku.get(sku);
      if (!productId) continue;

      await prisma.productRouting.updateMany({
        where: { tenantId, productId, active: true },
        data: { active: false },
      });

      const latest = await prisma.productRouting.findFirst({
        where: { tenantId, productId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;

      const routing = await prisma.productRouting.create({
        data: {
          tenantId,
          productId,
          name: template.name,
          version,
          active: true,
          operations: {
            create: template.operations.map((operation, index) => ({
              tenantId,
              code: operation.code,
              name: operation.name,
              sequence: (index + 1) * 10,
              runMinutesPerBatch: operation.runMinutes,
              setupMinutes: operation.setupMinutes,
              teardownMinutes: operation.teardownMinutes,
              changeoverFamily: template.family,
              isQcHold: operation.isQcHold ?? false,
              resources: {
                create: machineCodesForStep(operation.code)
                  .map((code, resourceIndex) => {
                    const workstationId = wsByCode.get(code);
                    if (!workstationId) return null;
                    return {
                      tenantId,
                      workstationId,
                      efficiencyPercent: resourceIndex === 0 ? 100 : 95,
                      preferred: resourceIndex === 0,
                    };
                  })
                  .filter((row): row is NonNullable<typeof row> => row != null),
              },
            })),
          },
        },
        include: { operations: { orderBy: { sequence: "asc" } } },
      });

      if (routing.operations.length > 1) {
        await prisma.routingDependency.createMany({
          data: routing.operations.slice(1).map((operation, index) => ({
            tenantId,
            fromOperationId: routing.operations[index].id,
            toOperationId: operation.id,
            minimumLagMinutes: 0,
          })),
          skipDuplicates: true,
        });
      }

      const orders = await prisma.productionOrder.findMany({
        where: { tenantId, productId },
        select: { id: true },
      });
      for (const order of orders) {
        for (const routeOp of routing.operations) {
          const codes = machineCodesForStep(routeOp.code);
          const preferredWs = codes.map((code) => wsByCode.get(code)).find(Boolean) ?? null;
          await prisma.productionOperation.updateMany({
            where: { tenantId, productionOrderId: order.id, operationCode: routeOp.code },
            data: {
              routingOperationId: routeOp.id,
              operationName: routeOp.name,
              workstationId: preferredWs,
            },
          });
        }
      }
    }
  }
}
