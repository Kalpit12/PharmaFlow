import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { parseScenarioExplanation } from "../src/lib/ai/scenario-explain";
import { fallbackScenarioExplanation, buildScenarioDecision } from "../src/lib/scenarios/decision";
import {
  buildAssumptionRows,
  buildComparisonRows,
  buildImpactChain,
  buildOperationalJourney,
} from "../src/lib/scenarios/journey";
import {
  applyCapacity,
  changeLabel,
  delayedOrderIds,
  isIdentityScenario,
  parseScenarioInput,
  simulateScenario,
} from "../src/lib/scenarios/engine";
import type { ScenarioBaselineFacts, ScenarioInput } from "../src/lib/scenarios/types";
import { DEFAULT_SCENARIO_INPUT } from "../src/lib/scenarios/types";
import { canReleaseBatch } from "../src/lib/batches/service";
import { computeMaterialRequirements } from "../src/lib/materials/requirements";
import { computeOrderMaterialReadiness } from "../src/lib/operations/planning";
import { canTransitionQualityStatus } from "../src/lib/quality/service";
import { hasPermission } from "../src/lib/auth/permissions";
import { can, canApprove } from "../src/lib/auth/authorization";
import { rankOperationalPriorities } from "../src/lib/intelligence/priorities";
import {
  getPlanningOutlook,
  getScenarioSnapshot,
  permittedScenarioDomains,
  scenarioContextHasForbiddenFields,
  toCompactScenarioContext,
} from "../src/lib/server/scenarios";
import type { TenantContext } from "../src/lib/server/errors";
import { formatCount } from "../src/lib/server/money";

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
  ],
  materials: [
    {
      productId: "p1",
      name: "Amoxicillin API",
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
  inventoryItems: [{ id: "i1", name: "Amoxicillin", available: 50, required: 45, shortfall: 0, health: "LOW" }],
  pendingRequisitions: 1,
  executionNeedsReview: 2,
  batchesOnHold: 1,
  qualityOpen: 2,
  qualityCritical: 1,
  customerExposure: 1,
  hasOperations: true,
  hasMaterials: true,
  hasInventory: true,
  hasProcurement: true,
  hasExecution: true,
  hasBatches: true,
  hasQuality: true,
  hasTraceability: true,
};

export async function runPhase38Verify(prisma: PrismaClient) {
  const sources = [
    "src/lib/scenarios/journey.ts",
    "src/lib/scenarios/decision.ts",
    "src/lib/server/scenarios.ts",
    "src/components/scenarios/ScenarioWorkspace.tsx",
    "src/components/command-center/CommandCenterWorkspace.tsx",
    "src/components/reports/ReportingWorkspace.tsx",
  ]
    .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
    .join("\n");
  assert(!/from ["']openai["']|new OpenAI|chat\.completions|OPENAI_API_KEY/.test(sources), "Phase 38 page-load surfaces perform ZERO OpenAI calls");
  assert(sources.includes("Operational journey"), "Flagship journey surface");
  assert(sources.includes("Impact chain"), "Impact chain surface");
  assert(sources.includes("Planning outlook"), "Command Center planning outlook");

  const simulated = simulateScenario(fixture, { ...DEFAULT_SCENARIO_INPUT, demandChangePct: 20 }, now);
  assert(simulated.shortages >= 1, "Demand change creates material impact");
  const journey = buildOperationalJourney(fixture, simulated, { ...DEFAULT_SCENARIO_INPUT, demandChangePct: 20 }, formatCount);
  assert(journey.some((row) => row.id === "materials"), "Operational journey includes materials");
  assert(journey.some((row) => row.id === "production"), "Operational journey includes production");
  const chain = buildImpactChain(fixture, simulated, { ...DEFAULT_SCENARIO_INPUT, demandChangePct: 20 }, formatCount);
  assert(chain.some((row) => /demand|material|capacity|delivery/i.test(row.trigger)), "Impact chain connects domains");
  const comparison = buildComparisonRows(fixture, simulated, formatCount);
  assert(comparison.every((row) => row.current && row.scenario), "Baseline vs scenario rows");
  const assumptions = buildAssumptionRows(DEFAULT_SCENARIO_INPUT);
  assert(assumptions.find((row) => row.id === "workforce")?.supported === false, "Unsupported workforce assumption disclosed");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && user, "Demo tenants exist");
  const ctxA: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const ctxB: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };
  const ctxQuality: TenantContext = { tenantId: tenant.id, userId: user.id, role: "QUALITY" };

  const snapshot = await getScenarioSnapshot(ctxA, { ...DEFAULT_SCENARIO_INPUT, demandChangePct: 20 }, now);
  assert(snapshot.openaiCallsOnLoad === 0, "Snapshot records zero OpenAI calls on load");
  assert(snapshot.journey.length >= 4, "Live journey populated");
  assert(snapshot.impactChain.length >= 1, "Live impact chain populated");
  assert(snapshot.decision.headline.length > 0, "Decision context present");
  assert(snapshot.comparison.length >= 4, "Comparison table present");

  const qualitySnap = await getScenarioSnapshot(ctxQuality, DEFAULT_SCENARIO_INPUT, now);
  assert(!qualitySnap.excludedDomains.includes("quality"), "Quality role retains quality domain");
  assert(qualitySnap.excludedDomains.includes("procurement"), "Quality role excludes procurement");

  const other = await getScenarioSnapshot(ctxB, DEFAULT_SCENARIO_INPUT, now);
  assert(other.brand !== snapshot.brand, "Tenant isolation");

  const context = toCompactScenarioContext(snapshot);
  assert(!scenarioContextHasForbiddenFields(context), "AI context sanitization");
  assert(context.simulation === "SIMULATED", "Compact context labelled simulated");

  const parsed = parseScenarioExplanation({
    summary: "Capacity pressure rises under demand surge.",
    keyDrivers: ["Material shortages increase"],
    impact: ["Delivery buffer narrows"],
    tradeOffs: ["Higher utilization"],
    limitations: ["Workforce not recorded"],
  });
  assert(parsed?.source === "openai", "AI response schema accepted");

  const decision = buildScenarioDecision({
    facts: fixture,
    simulated,
    scenarioInput: { ...DEFAULT_SCENARIO_INPUT, demandChangePct: 20 },
    risks: [],
    formatCount,
  });
  const fallback = fallbackScenarioExplanation({ decision, question: "Explain this scenario." });
  assert(fallback.source === "deterministic", "AI failure fallback");

  assert(permittedScenarioDomains("OPERATIONS").includes("production"), "Operations role sees production");
  assert(!permittedScenarioDomains("PROCUREMENT").includes("production"), "Procurement role filters production");
  assert(hasPermission("VIEWER", "production.read"), "Viewer read-only scenario visibility");

  const outlook = await getPlanningOutlook(ctxA);
  assert(outlook.currentState.length > 0 && outlook.href.includes("/scenarios"), "Planning outlook");

  const ordersBefore = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  await getScenarioSnapshot(ctxA, { ...DEFAULT_SCENARIO_INPUT, demandChangePct: 20, productionDelayDays: 7 }, now);
  const ordersAfter = await prisma.productionOrder.count({ where: { tenantId: tenant.id } });
  assert(ordersBefore === ordersAfter, "Scenario does not mutate live production orders");

  assert(isIdentityScenario(DEFAULT_SCENARIO_INPUT), "Baseline scenario");
  assert(canReleaseBatch({ qualityStatus: "ON_HOLD", manufacturingStatus: "COMPLETED", productionCompleted: true }), "Phase 33 regression");
  assert(canTransitionQualityStatus("OPEN", "INVESTIGATING"), "Phase 35 regression");
  assert(rankOperationalPriorities([]).length === 0, "Phase 37 regression");
  assert(canApprove("MANAGER") && !can("VIEWER", "batches.quality_action"), "Phase 36 regression");

  const explainSource = readFileSync(join(process.cwd(), "src/lib/ai/scenario-explain.ts"), "utf8");
  assert(explainSource.includes("chat.completions.create"), "Explicit explain may use one OpenAI call");
  assert(!explainSource.includes("proposeAction"), "Scenario explain cannot mutate");

  console.log("Phase 38 verification passed.");
}
