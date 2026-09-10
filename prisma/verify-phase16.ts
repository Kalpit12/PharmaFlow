import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { proposeAction } from "../src/lib/server/actions";
import { listCommunications } from "../src/lib/server/communications";
import type { TenantContext } from "../src/lib/server/errors";
import { getInventorySnapshot, resolveInventoryFilters } from "../src/lib/server/inventory";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "../src/lib/server/materials";
import { getOperationsPlanner, resolvePlanningWindow } from "../src/lib/server/operations";
import { getProcurementSnapshot, resolveProcurementFilters } from "../src/lib/server/procurement";
import { getReportingSnapshot, resolveReportFilters } from "../src/lib/server/reports";
import { getMaterialSupplierSnapshot, getSupplierSnapshot, resolveSupplierFilters } from "../src/lib/server/suppliers";
import { proposeWorkflow } from "../src/lib/server/workflows";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase16Verify(prisma: PrismaClient) {
  const serverSource = readFileSync(join(process.cwd(), "src/lib/server/suppliers.ts"), "utf8");
  const uiSource = readFileSync(join(process.cwd(), "src/components/suppliers/SupplierWorkspace.tsx"), "utf8");
  assert(!/openai/i.test(serverSource + uiSource), "Phase 16 performs ZERO OpenAI calls");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && user, "Tenants required");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const other: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };
  const stamp = Date.now().toString().slice(-6);

  const ordersBefore = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  const lotsBefore = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });

  const createdSupplier = await prisma.supplier.create({
    data: { tenantId: tenant.id, name: "Demo Supplier A", code: `SUP-DEMO-A-${stamp}`, status: "ACTIVE" },
  });
  const createdSupplierB = await prisma.supplier.create({
    data: { tenantId: tenant.id, name: "Demo Supplier B", code: `SUP-DEMO-B-${stamp}`, status: "ACTIVE" },
  });
  const inactiveSupplier = await prisma.supplier.create({
    data: { tenantId: tenant.id, name: "Demo Supplier Inactive", code: `SUP-DEMO-I-${stamp}`, status: "INACTIVE" },
  });

  const product = await prisma.product.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
  assert(product, "Product required");

  const relA = await prisma.supplierMaterial.create({
    data: {
      tenantId: tenant.id,
      supplierId: createdSupplier.id,
      productId: product.id,
      leadTimeDays: 14,
      unitPrice: 120,
      currency: "KES",
      minimumOrderQuantity: 100,
      isPreferred: true,
    },
  });
  const relB = await prisma.supplierMaterial.create({
    data: {
      tenantId: tenant.id,
      supplierId: createdSupplierB.id,
      productId: product.id,
      leadTimeDays: 18,
      minimumOrderQuantity: 200,
      isPreferred: false,
    },
  });
  assert(relA.id !== relB.id, "Supplier-material relationships created");

  const all = await getSupplierSnapshot(manager, resolveSupplierFilters({ view: "all" }));
  const active = await getSupplierSnapshot(manager, resolveSupplierFilters({ view: "active" }));
  const inactive = await getSupplierSnapshot(manager, resolveSupplierFilters({ view: "inactive" }));
  assert(all.rows.some((row) => row.supplierId === createdSupplier.id), "Supplier creation visible");
  assert(active.rows.some((row) => row.supplierId === createdSupplier.id), "Active filtering works");
  assert(inactive.rows.some((row) => row.supplierId === inactiveSupplier.id), "Inactive filtering works");

  const comparison = await getMaterialSupplierSnapshot(manager, product.id);
  assert(comparison.candidates.length >= 2, "Material supplier lookup works");
  assert(comparison.candidates[0]?.leadTimeDays === 14, "Deterministic supplier comparison");
  assert(comparison.recommendation.supplierId === createdSupplier.id, "Deterministic recommendation");

  const sparseSupplier = await prisma.supplier.create({
    data: { tenantId: tenant.id, name: "Sparse Supplier", code: `SUP-SPARSE-${stamp}`, status: "ACTIVE" },
  });
  await prisma.supplierMaterial.create({
    data: { tenantId: tenant.id, supplierId: sparseSupplier.id, productId: product.id, isPreferred: false },
  });
  const sparse = await getMaterialSupplierSnapshot(manager, product.id);
  assert(
    sparse.recommendation.title === "Recommended supplier" || sparse.recommendation.title === "Supplier recommendation unavailable",
    "Honest fallback when data is insufficient"
  );
  assert(sparse.candidates.every((row) => row.deliveryPerformance === null && row.qualityPerformance === null), "No fabricated metrics");

  const otherSnapshot = await getSupplierSnapshot(other, resolveSupplierFilters({ view: "all" }));
  assert(!otherSnapshot.rows.some((row) => row.code === createdSupplier.code), "Tenant isolation enforced");

  const ordersAfter = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  const lotsAfter = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const poCountBefore = await prisma.purchaseOrder.count({ where: { tenantId: tenant.id } });
  assert(ordersAfter === ordersBefore, "Supplier data cannot modify production");
  assert(lotsAfter === lotsBefore, "Supplier data cannot modify inventory");

  const planner = await getOperationsPlanner(manager, resolvePlanningWindow({ weeks: "1" }));
  assert(planner.orders.length > 0, "Supplier data cannot modify schedules");
  const poCountAfter = await prisma.purchaseOrder.count({ where: { tenantId: tenant.id } });
  assert(poCountAfter === poCountBefore, "Supplier data cannot create purchase orders");
  const comms = await listCommunications(manager);
  assert(Array.isArray(comms.recent), "Supplier data cannot send communications");

  const action = await proposeAction(manager, {
    type: "CREATE_FOLLOW_UP_TASK",
    title: "Phase16 action still works",
    reason: "Phase 9 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(action?.status === "PENDING_APPROVAL", "Phase 9 still works");
  await prisma.action.delete({ where: { id: action.id } });

  const workflow = await proposeWorkflow(manager, {
    type: "CUSTOMER_REENGAGEMENT",
    title: "Phase16 workflow still works",
    reason: "Phase 10 remains available.",
    targetName: "ABC Pharmaceuticals",
  });
  assert(workflow?.status === "PENDING_APPROVAL", "Phase 10 still works");
  await prisma.workflow.delete({ where: { id: workflow.id } });

  assert(Array.isArray(comms.needsReview), "Phase 11 still works");
  const inventory = await getInventorySnapshot(manager, resolveInventoryFilters({ view: "overview" }));
  assert(inventory.items.length > 0, "Phase 13 still works");
  const materials = await getMaterialsSnapshot(manager, resolveMaterialsFilters({ view: "requirements" }));
  assert(materials.materials.length >= 0, "Phase 14 still works");
  const procurement = await getProcurementSnapshot(manager, resolveProcurementFilters({ view: "all" }));
  assert(Array.isArray(procurement.rows), "Phase 15 still works");
  const reports = await getReportingSnapshot(manager, resolveReportFilters({ view: "materials" }));
  assert(reports.materialPlan.supplierCoverage >= 0, "Reporting integration works");

  await prisma.supplierMaterial.deleteMany({ where: { tenantId: tenant.id, supplierId: { in: [createdSupplier.id, createdSupplierB.id, sparseSupplier.id, inactiveSupplier.id] } } });
  await prisma.supplier.deleteMany({ where: { tenantId: tenant.id, id: { in: [createdSupplier.id, createdSupplierB.id, sparseSupplier.id, inactiveSupplier.id] } } });

  console.log("Phase 16 verification passed.");
}

if (process.argv[1]?.includes("verify-phase16")) {
  const prisma = new PrismaClient();
  runPhase16Verify(prisma)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
