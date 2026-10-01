import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { detectBomCycle, explodeOrderDemand, explodeOrderDemandSingleLevel } from "../src/lib/materials/mrp";
import {
  classifyMaterialRisk,
  computeMaterialRequirements,
  isOpenProductionStatus,
  orderIdsAtMaterialRisk,
  roundQty,
} from "../src/lib/materials/requirements";
import { buildMaterialPriority, computeShortageTimeline } from "../src/lib/materials/shortages";
import { computeOrderMaterialReadiness } from "../src/lib/operations/planning";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "../src/lib/server/materials";
import type { TenantContext } from "../src/lib/server/errors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixtureNow(): Date {
  return new Date("2026-08-17T12:00:00.000Z");
}

function baseFixture() {
  return {
    now: fixtureNow(),
    identities: [
      { id: "fg", sku: "FG-1", name: "Finished", unit: "unit", safetyStock: 0 },
      { id: "semi", sku: "SEMI-1", name: "Intermediate", unit: "kg", safetyStock: 0 },
      { id: "api", sku: "API-X", name: "API X", unit: "kg", safetyStock: 0 },
      { id: "pack", sku: "PACK-1", name: "Packaging", unit: "unit", safetyStock: 0 },
    ],
    boms: [
      { productId: "fg", componentId: "semi", quantityPer: 0.5 },
      { productId: "fg", componentId: "pack", quantityPer: 0.2 },
      { productId: "semi", componentId: "api", quantityPer: 2 },
    ],
    orders: [
      {
        id: "po-1",
        orderNumber: "PO-1",
        productId: "fg",
        productName: "Finished",
        quantity: 100,
        dueDate: "2026-08-22T00:00:00.000Z",
        priority: "HIGH" as const,
        status: "SCHEDULED",
        plannedStart: "2026-08-20T08:00:00.000Z",
        plannedEnd: "2026-08-21T16:00:00.000Z",
      },
    ],
    lots: [
      { productId: "api", batchCode: "API-LOT", quantity: 150, expiryDate: "2027-01-01T00:00:00.000Z", warehouseName: "RM" },
      { productId: "pack", batchCode: "PK-LOT", quantity: 40, expiryDate: null, warehouseName: "PK" },
      { productId: "semi", batchCode: "SEMI-LOT", quantity: 10, expiryDate: null, warehouseName: "WIP" },
    ],
    receipts: [{ productId: "api", quantity: 50 }],
  };
}

export async function runPhase32Verify(prisma: PrismaClient) {
  const engineSource = readFileSync(join(process.cwd(), "src/lib/materials/requirements.ts"), "utf8");
  const mrpSource = readFileSync(join(process.cwd(), "src/lib/materials/mrp.ts"), "utf8");
  const shortagesSource = readFileSync(join(process.cwd(), "src/lib/materials/shortages.ts"), "utf8");
  const serverSource = readFileSync(join(process.cwd(), "src/lib/server/materials.ts"), "utf8");
  assert(!/openai/i.test(engineSource + mrpSource + shortagesSource + serverSource), "Phase 32 performs ZERO OpenAI calls");

  // 1. Single-level regression preserved
  const singleLevel = explodeOrderDemandSingleLevel("fg", 100, baseFixture().boms);
  assert(singleLevel.get("semi") === 50, "Single-level explosion unchanged for direct components");
  assert(!singleLevel.has("api"), "Single-level does not recurse");

  // 2. Multi-level BOM explosion
  const explosion = explodeOrderDemand("fg", 100, baseFixture().boms, new Map(baseFixture().identities.map((row) => [row.id, row.sku])));
  assert(explosion.ok, "Multi-level explosion succeeds");
  assert(explosion.ok && explosion.demands.get("api")?.requiredQuantity === 100, "Semi BOM rolls up API demand: 100 * 0.5 * 2");
  assert(explosion.ok && explosion.demands.get("pack")?.requiredQuantity === 20, "Direct packaging demand preserved");

  // 3. BOM cycle protection
  const cycle = detectBomCycle([
    { productId: "a", componentId: "b", quantityPer: 1 },
    { productId: "b", componentId: "a", quantityPer: 1 },
  ]);
  assert(cycle !== null, "Cycle detection finds loops");
  const cyclicExplosion = explodeOrderDemand("a", 1, [
    { productId: "a", componentId: "b", quantityPer: 1 },
    { productId: "b", componentId: "a", quantityPer: 1 },
  ]);
  assert(!cyclicExplosion.ok, "Explosion aborts on cycle");
  assert(!cyclicExplosion.ok && cyclicExplosion.cyclePath.includes("a") && cyclicExplosion.cyclePath.includes("b"), "Cycle path names both products");

  // 4–9. Canonical MRP calculations (Phase 14 regression + multi-level)
  const rows = computeMaterialRequirements(baseFixture());
  const api = rows.find((row) => row.sku === "API-X");
  const pack = rows.find((row) => row.sku === "PACK-1");
  assert(api && pack, "Multi-level requirements include leaf materials");
  assert(api.grossRequirement === 100, "Gross requirement through BOM explosion");
  assert(api.onHand === 150, "On hand from usable lots");
  assert(api.allocated === 100, "Allocated equals gross open production demand");
  assert(api.available === 150, "Available alias equals on hand");
  assert(api.incoming === 50, "Incoming from open receipts");
  assert(api.projectedAvailable === 100, "Projected = on hand + incoming - gross");
  assert(api.netRequirement === 0, "Net requirement when projected covers gross");
  assert(api.shortage === false, "No shortage when projected available >= 0");

  // Phase 14 style single-level fixture still passes
  const phase14Rows = computeMaterialRequirements({
    now: fixtureNow(),
    identities: [
      { id: "api", sku: "API-X", name: "API X", unit: "kg", safetyStock: 0 },
      { id: "pack", sku: "PACK-1", name: "Packaging", unit: "unit", safetyStock: 0 },
    ],
    boms: [
      { productId: "fg", componentId: "api", quantityPer: 0.01 },
      { productId: "fg", componentId: "pack", quantityPer: 0.2 },
    ],
    orders: [
      {
        id: "po-1",
        orderNumber: "PO-1",
        productId: "fg",
        productName: "Finished",
        quantity: 100_000,
        dueDate: "2026-08-22T00:00:00.000Z",
        priority: "HIGH",
        status: "SCHEDULED",
        plannedStart: "2026-08-20T08:00:00.000Z",
        plannedEnd: "2026-08-21T16:00:00.000Z",
      },
      {
        id: "po-2",
        orderNumber: "PO-2",
        productId: "fg",
        productName: "Finished",
        quantity: 50_000,
        dueDate: "2026-09-10T00:00:00.000Z",
        priority: "NORMAL",
        status: "UNSCHEDULED",
        plannedStart: null,
        plannedEnd: null,
      },
    ],
    lots: [
      { productId: "api", batchCode: "API-LOT", quantity: 800, expiryDate: "2027-01-01T00:00:00.000Z", warehouseName: "RM" },
      { productId: "api", batchCode: "API-EXP", quantity: 500, expiryDate: "2026-01-01T00:00:00.000Z", warehouseName: "RM" },
      { productId: "pack", batchCode: "PK-LOT", quantity: 40_000, expiryDate: null, warehouseName: "PK" },
    ],
    receipts: [{ productId: "api", quantity: 200 }, { productId: "pack", quantity: 5_000 }],
  });
  const api14 = phase14Rows.find((row) => row.sku === "API-X");
  assert(api14?.grossRequirement === 1500, "Phase 14 gross requirement regression");
  assert(api14?.available === 800, "Phase 14 available regression");
  assert(api14?.projectedAvailable === -500, "Phase 14 projected regression");
  assert(api14?.shortage === true, "Phase 14 shortage regression");
  assert(api14?.risk === "CRITICAL", "Phase 14 risk regression");

  // 10–12. Shortage detection and timing
  const timeline = computeShortageTimeline({
    onHand: 800,
    incoming: 200,
    grossRequirement: 1500,
    projectedAvailable: -500,
    shortage: true,
    affectedOrders: phase14Rows.find((row) => row.sku === "API-X")!.affectedOrders,
    now: fixtureNow(),
  });
  assert(timeline.status === "SHORTAGE", "Shortage status");
  assert(timeline.earliestShortageDate !== null, "Earliest shortage date when schedule exists");

  // 13. Priority ranking
  const priority = buildMaterialPriority({
    shortage: true,
    shortageStatus: "SHORTAGE",
    netRequirement: 500,
    affectedOrders: api14!.affectedOrders,
    earliestDueDate: api14!.earliestDueDate,
    riskRank: 4,
    now: fixtureNow(),
  });
  assert(priority.level === "CRITICAL", "Critical priority for imminent high-priority shortage");

  // 14. UNKNOWN when data insufficient
  const unknownTimeline = computeShortageTimeline({
    onHand: 0,
    incoming: 0,
    grossRequirement: 10,
    projectedAvailable: -10,
    shortage: true,
    affectedOrders: [],
    now: fixtureNow(),
  });
  assert(unknownTimeline.status === "UNKNOWN", "UNKNOWN when no affected orders");

  // 15. Production order impact
  const atRisk = orderIdsAtMaterialRisk(phase14Rows);
  assert(atRisk.includes("po-1") && atRisk.includes("po-2"), "Production orders at risk from shortages");

  // 16. Phase 31 material-readiness regression
  const readiness = computeOrderMaterialReadiness(phase14Rows, "po-1", true);
  assert(readiness.state === "SHORTAGE", "Phase 31 readiness still detects shortages");
  assert(readiness.affectedMaterials.length >= 1, "Phase 31 blocking materials preserved");

  // Tenant isolation via server snapshot
  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  assert(tenant && tenantB, "Demo tenants exist");
  const ctxA: TenantContext = { tenantId: tenant.id, userId: null, role: null };
  const ctxB: TenantContext = { tenantId: tenantB.id, userId: null, role: null };
  const snapshotA = await getMaterialsSnapshot(ctxA, resolveMaterialsFilters({}));
  const snapshotB = await getMaterialsSnapshot(ctxB, resolveMaterialsFilters({}));
  if (snapshotA.materials.length > 0 && snapshotB.materials.length > 0) {
    const skusA = new Set(snapshotA.materials.map((row) => row.sku));
    const overlap = snapshotB.materials.filter((row) => skusA.has(row.sku) && row.grossRequirement > 0);
    assert(overlap.length === 0, "Tenant B materials do not leak tenant A SKU demand");
  }

  assert(isOpenProductionStatus("SCHEDULED"), "Open production status helper intact");
  assert(classifyMaterialRisk({
    shortage: true,
    available: 1,
    incoming: 0,
    grossRequirement: 10,
    projectedAvailable: -9,
    affectedPriorities: ["HIGH"],
    earliestDueDate: "2026-08-18T00:00:00.000Z",
    now: fixtureNow(),
  }) === "CRITICAL", "Risk classifier intact");

  console.log("Phase 32 verification passed.");
}

if (process.argv[1]?.includes("verify-phase32")) {
  const prisma = new PrismaClient();
  runPhase32Verify(prisma)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
