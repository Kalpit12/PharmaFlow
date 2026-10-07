import type { PrismaClient } from "@prisma/client";

type RouteTemplate = {
  skus: string[];
  name: string;
  family: string;
  operations: Array<{
    code: string;
    name: string;
    runMinutes: number;
    setupMinutes: number;
    teardownMinutes: number;
    workstationCodes: string[];
  }>;
};

const ROUTES: RouteTemplate[] = [
  {
    skus: ["AMOX-500-CAP"],
    name: "Capsule manufacture and pack",
    family: "BETA_LACTAM",
    operations: [
      {
        code: "ENCAPSULATE",
        name: "Encapsulation",
        runMinutes: 360,
        setupMinutes: 90,
        teardownMinutes: 60,
        workstationCodes: ["CLA"],
      },
      {
        code: "PACK",
        name: "Primary and secondary packaging",
        runMinutes: 180,
        setupMinutes: 45,
        teardownMinutes: 30,
        workstationCodes: ["PLA", "PLB"],
      },
    ],
  },
  {
    skus: ["PARA-500-TAB", "FERRO-FOLIC-TAB", "AZITH-500-TAB"],
    name: "Tablet manufacture and pack",
    family: "GENERAL_TABLET",
    operations: [
      {
        code: "BLEND",
        name: "Blending",
        runMinutes: 180,
        setupMinutes: 45,
        teardownMinutes: 30,
        workstationCodes: ["TLA", "TLB"],
      },
      {
        code: "COMPRESS",
        name: "Tablet compression",
        runMinutes: 240,
        setupMinutes: 30,
        teardownMinutes: 20,
        workstationCodes: ["TLA", "TLB"],
      },
      {
        code: "PACK",
        name: "Primary and secondary packaging",
        runMinutes: 120,
        setupMinutes: 20,
        teardownMinutes: 15,
        workstationCodes: ["PLA", "PLB"],
      },
    ],
  },
  {
    skus: ["COUGH-SYR-100"],
    name: "Liquid manufacture, fill and pack",
    family: "LIQUID",
    operations: [
      {
        code: "COMPOUND",
        name: "Liquid compounding",
        runMinutes: 300,
        setupMinutes: 60,
        teardownMinutes: 45,
        workstationCodes: ["LLA"],
      },
      {
        code: "FILL",
        name: "Bottle filling",
        runMinutes: 240,
        setupMinutes: 45,
        teardownMinutes: 30,
        workstationCodes: ["LLA"],
      },
      {
        code: "PACK",
        name: "Secondary packaging",
        runMinutes: 120,
        setupMinutes: 20,
        teardownMinutes: 15,
        workstationCodes: ["PLA", "PLB"],
      },
    ],
  },
];

export async function ensureApsDemoData(prisma: PrismaClient) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  if (!tenant) return;

  const [products, workstations] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId: tenant.id, sku: { in: ROUTES.flatMap((route) => route.skus) } },
      select: { id: true, sku: true },
    }),
    prisma.workstation.findMany({
      where: { tenantId: tenant.id, active: true },
      select: { id: true, code: true },
    }),
  ]);
  const productBySku = new Map(products.map((product) => [product.sku, product]));
  const workstationByCode = new Map(workstations.map((workstation) => [workstation.code, workstation]));

  for (const template of ROUTES) {
    for (const sku of template.skus) {
      const product = productBySku.get(sku);
      if (!product) continue;

      let routing = await prisma.productRouting.findFirst({
        where: { tenantId: tenant.id, productId: product.id, active: true },
        include: { operations: { include: { resources: true }, orderBy: { sequence: "asc" } } },
      });

      if (!routing) {
        routing = await prisma.productRouting.create({
          data: {
            tenantId: tenant.id,
            productId: product.id,
            name: template.name,
            version: 1,
            active: true,
            operations: {
              create: template.operations.map((operation, index) => ({
                tenantId: tenant.id,
                code: operation.code,
                name: operation.name,
                sequence: (index + 1) * 10,
                runMinutesPerBatch: operation.runMinutes,
                setupMinutes: operation.setupMinutes,
                teardownMinutes: operation.teardownMinutes,
                changeoverFamily: template.family,
                resources: {
                  create: operation.workstationCodes.flatMap((code, resourceIndex) => {
                    const workstation = workstationByCode.get(code);
                    if (!workstation) return [];
                    return [
                      {
                        tenantId: tenant.id,
                        workstationId: workstation.id,
                        efficiencyPercent: resourceIndex === 0 ? 100 : 95,
                        preferred: resourceIndex === 0,
                      },
                    ];
                  }),
                },
              })),
            },
          },
          include: { operations: { include: { resources: true }, orderBy: { sequence: "asc" } } },
        });
      }

      const existingDependencyCount = await prisma.routingDependency.count({
        where: { tenantId: tenant.id, fromOperation: { routingId: routing.id } },
      });
      if (existingDependencyCount === 0 && routing.operations.length > 1) {
        await prisma.routingDependency.createMany({
          data: routing.operations.slice(1).map((operation, index) => ({
            tenantId: tenant.id,
            fromOperationId: routing!.operations[index].id,
            toOperationId: operation.id,
            minimumLagMinutes: 0,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  const changeovers = [
    {
      workstationId: null,
      fromFamily: "GENERAL_TABLET",
      toFamily: "BETA_LACTAM",
      durationMinutes: 120,
      reason: "Validated line clearance before beta-lactam work.",
    },
    {
      workstationId: null,
      fromFamily: "BETA_LACTAM",
      toFamily: "GENERAL_TABLET",
      durationMinutes: 240,
      reason: "Enhanced cleaning and line-clearance verification after beta-lactam work.",
    },
    {
      workstationId: null,
      fromFamily: "LIQUID",
      toFamily: "GENERAL_TABLET",
      durationMinutes: 60,
      reason: "Packaging format change and line clearance.",
    },
    {
      workstationId: null,
      fromFamily: "GENERAL_TABLET",
      toFamily: "LIQUID",
      durationMinutes: 60,
      reason: "Packaging format change and line clearance.",
    },
  ];
  for (const rule of changeovers) {
    const existing = await prisma.changeoverRule.findFirst({
      where: {
        tenantId: tenant.id,
        workstationId: rule.workstationId,
        fromFamily: rule.fromFamily,
        toFamily: rule.toFamily,
      },
    });
    if (!existing) {
      await prisma.changeoverRule.create({ data: { tenantId: tenant.id, ...rule } });
    }
  }

  await prisma.planningPolicy.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, freezeMinutes: 480, autopilotMode: "OFF" },
    update: {},
  });

  const allWorkstations = await prisma.workstation.findMany({
    where: { tenantId: tenant.id, active: true },
    select: { id: true },
  });
  for (const workstation of allWorkstations) {
    const shiftCount = await prisma.workstationShift.count({ where: { workstationId: workstation.id } });
    if (shiftCount === 0) {
      await prisma.workstationShift.createMany({
        data: [1, 2, 3, 4, 5].map((weekday) => ({
          tenantId: tenant.id,
          workstationId: workstation.id,
          weekday,
          startMinute: 8 * 60,
          endMinute: 16 * 60,
        })),
      });
    }
    const shutdown = await prisma.workstationCalendarException.findFirst({
      where: { workstationId: workstation.id, date: new Date("2026-10-20") },
    });
    if (!shutdown) {
      await prisma.workstationCalendarException.create({
        data: {
          tenantId: tenant.id,
          workstationId: workstation.id,
          date: new Date("2026-10-20"),
          reason: "Mashujaa Day plant shutdown",
          closed: true,
        },
      });
    }
  }

  const orders = await prisma.productionOrder.findMany({
    where: { tenantId: tenant.id, operations: { none: {} } },
    include: {
      product: {
        include: {
          routings: {
            where: { active: true },
            include: { operations: { include: { resources: true }, orderBy: { sequence: "asc" } } },
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  for (const order of orders) {
    const operations = order.product.routings[0]?.operations ?? [];
    if (operations.length === 0) continue;
    const totalWeight = operations.reduce((sum, operation) => sum + operation.runMinutesPerBatch, 0);
    await prisma.productionOperation.createMany({
      data: operations.map((operation) => {
        const qualified = operation.resources.find(
          (resource) => resource.workstationId === order.workstationId
        );
        const selected =
          qualified ?? operation.resources.find((resource) => resource.preferred) ?? operation.resources[0];
        return {
          tenantId: tenant.id,
          productionOrderId: order.id,
          routingOperationId: operation.id,
          operationCode: operation.code,
          operationName: operation.name,
          sequence: operation.sequence,
          workstationId: selected?.workstationId ?? null,
          durationMinutes: Math.max(
            30,
            Math.round(order.durationMinutes * (operation.runMinutesPerBatch / totalWeight))
          ),
          setupMinutes: operation.setupMinutes,
          teardownMinutes: operation.teardownMinutes,
          changeoverFamily: operation.changeoverFamily,
          status:
            order.status === "COMPLETED"
              ? "COMPLETED"
              : order.status === "IN_PROGRESS" && operation.sequence === operations[0].sequence
                ? "IN_PROGRESS"
                : "UNSCHEDULED",
          isLocked: order.isLocked,
        };
      }),
      skipDuplicates: true,
    });
  }
}
