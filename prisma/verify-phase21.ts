import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { detectIntent } from "../src/lib/ai/detect-intent";
import { INTENT_TOOLS } from "../src/lib/ai/context";
import {
  applyCapacity,
  changeLabel,
  delayedOrderIds,
  impactSeverity,
  isIdentityScenario,
  parseScenarioFromQuestion,
  parseScenarioInput,
  simulateMaterial,
  simulateScenario,
} from "../src/lib/scenarios/engine";
import type { ScenarioBaselineFacts, ScenarioInput } from "../src/lib/scenarios/types";
import { DEFAULT_SCENARIO_INPUT } from "../src/lib/scenarios/types";
import type { TenantContext } from "../src/lib/server/errors";
import { getScenarioSnapshot, toCompactScenarioContext } from "../src/lib/server/scenarios";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const now = new Date("2026-08-23T12:00:00.000Z");

const fixture: ScenarioBaselineFacts = {
  revenueOutlook: 100,
  revenueConfidence: "MEDIUM",
  rfqDemand: 10,
  rfqConfidence: "MEDIUM",
  productionUtilization: 50,
  dueInHorizon: 3,
  atRisk: 1,
  unscheduled: 0,
  orders: [
    {
      id: "o1",
      productName: "Amoxicillin",
      dueDate: "2026-08-25T00:00:00.000Z",
      priority: "NORMAL",
      displayStatus: "SCHEDULED",
    },
    {
      id: "o2",
      productName: "Paracetamol",
      dueDate: "2026-09-10T00:00:00.000Z",
      priority: "CRITICAL",
      displayStatus: "SCHEDULED",
    },
    {
      id: "o3",
      productName: "Ferrous-Folic",
      dueDate: "2026-08-24T00:00:00.000Z",
      priority: "NORMAL",
      displayStatus: "AT_RISK",
    },
  ],
  materials: [
    {
      productId: "p1",
      name: "Amoxicillin",
      available: 100,
      incoming: 0,
      grossRequirement: 100,
      projectedAvailable: 0,
      shortage: false,
      risk: "LOW",
      earliestDueDate: "2026-08-25T00:00:00.000Z",
      affectedOrderCount: 1,
    },
  ],
  inventoryItems: [
    { id: "i1", name: "Amoxicillin", available: 50, required: 45, shortfall: 0, health: "LOW" },
  ],
  pendingRequisitions: 1,
  executionNeedsReview: 2,
  batchesOnHold: 0,
  qualityOpen: 0,
  qualityCritical: 0,
  customerExposure: 0,
  hasOperations: true,
  hasMaterials: true,
  hasInventory: true,
  hasProcurement: true,
  hasExecution: true,
  hasBatches: true,
  hasQuality: true,
  hasTraceability: true,
};

export async function runPhase21Verify(prisma: PrismaClient) {
  const pageSource = readFileSync(join(process.cwd(), "src/app/(workspace)/scenarios/page.tsx"), "utf8");
  const engineSource = readFileSync(join(process.cwd(), "src/lib/scenarios/engine.ts"), "utf8");
  const serverSource = readFileSync(join(process.cwd(), "src/lib/server/scenarios.ts"), "utf8");
  const uiSource = readFileSync(join(process.cwd(), "src/components/scenarios/ScenarioWorkspace.tsx"), "utf8");

  assert(!/generateResponse|runProductionOrchestrator|chat\.completions|openaiAIProvider/i.test(pageSource + engineSource + serverSource), "Scenario engine has no OpenAI dependency");
  assert(!/tensorflow|scikit|openai/i.test(engineSource), "No ML libraries in scenario engine");
  assert(/Explain/.test(uiSource) && /\/api\/scenarios\/explain/.test(uiSource), "Explicit explanation uses dedicated scenario explain API");
  assert(!/\/api\/ai/.test(uiSource), "Scenario UI does not use mutating /api/ai orchestrator");
  assert(!/decideAction|createRequisitionDraft|plannedStart/.test(uiSource), "Scenario UI does not execute");
  assert(/Simulation only/.test(uiSource), "Simulation-only labelling");

  assert(parseScenarioInput({ demand: "20" }).demandChangePct === 20, "Demand allowlist");
  assert(parseScenarioInput({ demand: "99" }).demandChangePct === 0, "Arbitrary demand rejected");
  assert(parseScenarioInput({ capacity: "-20" }).productionCapacityChangePct === -20, "Capacity allowlist");
  assert(parseScenarioInput({ delay: "3" }).productionDelayDays === 3, "Delay allowlist");
  assert(parseScenarioInput({ inventory: "-20" }).inventoryAvailabilityChangePct === -20, "Inventory allowlist");
  assert(parseScenarioInput({ procurement: "-20" }).procurementAvailabilityChangePct === -20, "Procurement allowlist");
  assert(isIdentityScenario(DEFAULT_SCENARIO_INPUT), "Default is identity");

  const identity = simulateScenario(fixture, DEFAULT_SCENARIO_INPUT, now);
  assert(identity.revenue === 100 && identity.rfq === 10, "Identity preserves demand");
  assert(identity.utilization === 50, "Identity preserves capacity");
  assert(identity.shortages === 0, "Identity preserves material coverage");
  assert(identity.atRisk === 1, "Identity preserves at-risk count");
  assert(identity.pendingRequisitions === 1, "Identity preserves procurement");

  const demand = simulateScenario(fixture, { ...DEFAULT_SCENARIO_INPUT, demandChangePct: 20 }, now);
  assert(demand.revenue === 120, "Demand +20% scales revenue");
  assert(demand.rfq === 12, "Demand +20% scales RFQ");
  assert(demand.shortages === 1, "Demand +20% creates a shortage from zero projected");
  assert(simulateMaterial(fixture.materials[0], 1.2, 1, 1).shortage, "Material demand math");

  const capacity = simulateScenario(fixture, { ...DEFAULT_SCENARIO_INPUT, productionCapacityChangePct: -20 }, now);
  assert(applyCapacity(50, -20) === 63, "Capacity -20% raises utilization");
  assert(capacity.utilization === 63, "Capacity change calculates correctly");
  const relief = simulateScenario(fixture, { ...DEFAULT_SCENARIO_INPUT, productionCapacityChangePct: 20 }, now);
  assert(relief.utilization === 42, "Capacity +20% lowers utilization");

  const delay = simulateScenario(fixture, { ...DEFAULT_SCENARIO_INPUT, productionDelayDays: 3 }, now);
  assert(delayedOrderIds(fixture.orders, 3, now).includes("o1"), "Order due in 2 days misses a 3-day delay");
  assert(delay.delayedOrders === 2 && delay.atRisk === 2, "Production delays calculate correctly");

  const inventory = simulateScenario(fixture, { ...DEFAULT_SCENARIO_INPUT, inventoryAvailabilityChangePct: -20 }, now);
  assert(inventory.constrained >= 1, "Inventory -20% constrains the tight item");
  const inventoryUp = simulateScenario(fixture, { ...DEFAULT_SCENARIO_INPUT, inventoryAvailabilityChangePct: 10 }, now);
  assert(inventoryUp.constrained <= inventory.constrained, "Inventory +10% does not worsen constraint");

  const procurement = simulateScenario(fixture, { ...DEFAULT_SCENARIO_INPUT, procurementAvailabilityChangePct: -20 }, now);
  assert(procurement.shortages === 0, "Procurement -20% on zero inbound does not fabricate a shortage");
  const inboundFacts: ScenarioBaselineFacts = {
    ...fixture,
    materials: [{ ...fixture.materials[0], incoming: 20, projectedAvailable: 20, shortage: false, grossRequirement: 100 }],
  };
  const supply = simulateScenario(inboundFacts, { ...DEFAULT_SCENARIO_INPUT, procurementAvailabilityChangePct: -20 }, now);
  assert(simulateMaterial(inboundFacts.materials[0], 1, 1, 0.8).projected === 16, "Procurement availability scales inbound");
  assert(supply.pendingRequisitions >= inboundFacts.pendingRequisitions, "Procurement change is applied");

  const combinedInput: ScenarioInput = {
    ...DEFAULT_SCENARIO_INPUT,
    demandChangePct: 20,
    productionCapacityChangePct: -20,
    productionDelayDays: 3,
  };
  const combined = simulateScenario(fixture, combinedInput, now);
  assert(combined.revenue === 120 && combined.utilization === 63 && combined.delayedOrders === 2, "Combined scenarios calculate correctly");
  const again = simulateScenario(fixture, combinedInput, now);
  assert(JSON.stringify(combined) === JSON.stringify(again), "Scenario engine is deterministic");

  const critical = simulateScenario(fixture, { ...DEFAULT_SCENARIO_INPUT, priorityMode: "critical" }, now);
  assert(critical.deprioritized >= 1, "Critical priority deprioritizes non-critical due-in-horizon orders");
  assert(impactSeverity({ baseline: 50, scenario: 63, worseWhen: "up" }) === "HIGH", "Severity calculation is deterministic");
  assert(changeLabel(0, 10, "percent") === "—", "Zero baselines do not produce misleading percentages");
  assert(changeLabel(null, 10, "percent") === "—", "Insufficient data is handled honestly");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && user, "Tenants required");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const other: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };

  const ordersBefore = await prisma.order.count({ where: { tenantId: tenant.id } });
  const lotsBefore = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const productionBefore = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  const reqBefore = await prisma.procurementRequisition.count({ where: { tenantId: tenant.id } });
  const actionsBefore = await prisma.action.count({ where: { tenantId: tenant.id } });

  const baseline = await getScenarioSnapshot(manager, DEFAULT_SCENARIO_INPUT, now);
  const surged = await getScenarioSnapshot(manager, { ...DEFAULT_SCENARIO_INPUT, demandChangePct: 20 }, now);
  assert(baseline.simulationOnly && /[Ss]imulation/.test(baseline.planningNote), "Simulation-only snapshot");
  assert(baseline.brand !== "" && surged.inputs.demandChangePct === 20, "Live snapshot");
  const emptyish = await getScenarioSnapshot(other, DEFAULT_SCENARIO_INPUT, now);
  assert(emptyish.brand.length > 0, "Empty tenant behavior");
  assert(baseline.brand !== emptyish.brand, "Tenant isolation");

  const compact = toCompactScenarioContext(surged);
  const compactJson = JSON.stringify(compact);
  assert(compact.simulation === "SIMULATED", "Compact packet labelled simulated");
  assert(!compactJson.includes(tenant.id) && !compactJson.includes(tenantB.id), "AI context contains no tenant UUID");
  assert(!/DATABASE_URL|postgres:\/\//i.test(compactJson), "AI context contains no credentials");

  const intent = detectIntent("Explain this scenario. horizon=30 demand=20 capacity=0 delay=0 inventory=0 procurement=0 priority=current");
  assert(intent.intent === "SCENARIO", "Scenario intent detected");
  assert(INTENT_TOOLS.SCENARIO[0] === "get_scenario", "Scenario uses get_scenario tool");
  assert(parseScenarioFromQuestion("Explain this scenario. demand=20").demandChangePct === 20, "Question parser");

  const ordersAfter = await prisma.order.count({ where: { tenantId: tenant.id } });
  const lotsAfter = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const productionAfter = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  const reqAfter = await prisma.procurementRequisition.count({ where: { tenantId: tenant.id } });
  const actionsAfter = await prisma.action.count({ where: { tenantId: tenant.id } });
  assert(ordersAfter === ordersBefore, "No mutation of orders");
  assert(lotsAfter === lotsBefore, "No mutation of inventory");
  assert(productionAfter === productionBefore, "No mutation of production schedules");
  assert(reqAfter === reqBefore, "No mutation of procurement");
  assert(actionsAfter === actionsBefore, "No mutation of actions");

  console.log("Phase 21 verification passed.");
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("verify-phase21.ts");
if (invokedDirectly) {
  const prisma = new PrismaClient();
  runPhase21Verify(prisma)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
