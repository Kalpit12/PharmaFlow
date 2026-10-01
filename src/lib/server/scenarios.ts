import { Prisma } from "@prisma/client";

import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { buildMetric, horizonLabel, operationsWeeksForHorizon } from "@/lib/forecasting/engine";
import { buildScenarioDecision } from "@/lib/scenarios/decision";
import {
  buildAssumptionRows,
  buildComparisonRows,
  buildImpactChain,
  buildOperationalJourney,
} from "@/lib/scenarios/journey";
import { isIdentityScenario } from "@/lib/scenarios/engine";
import { periodTotals } from "@/lib/server/analytics";
import { getBatchesSnapshot } from "@/lib/server/batches";
import { addUtcDays, trailingDays } from "@/lib/server/dates";
import type { TenantContext } from "@/lib/server/errors";
import { getExecutionSnapshot } from "@/lib/server/execution";
import { getInventorySnapshot, resolveInventoryFilters } from "@/lib/server/inventory";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { formatCount, formatKes } from "@/lib/server/money";
import { getOperationsPlanner, resolvePlanningWindow } from "@/lib/server/operations";
import { getProcurementSnapshot, resolveProcurementFilters } from "@/lib/server/procurement";
import { getQualitySnapshot, resolveQualityFilters } from "@/lib/server/quality";
import { getTenant } from "@/lib/server/services/tenant";
import { getTraceabilityAttention } from "@/lib/server/traceability";
import {
  changeLabel,
  impactDirection,
  impactSeverity,
  parseScenarioInput,
  simulateScenario,
} from "@/lib/scenarios/engine";
import type {
  CompactScenarioContext,
  ScenarioBaselineFacts,
  ScenarioImpact,
  ScenarioComparisonRow,
  ScenarioInput,
  ScenarioRisk,
  ScenarioSnapshot,
  PlanningOutlook,
  JourneyStage,
  ImpactChainLink,
} from "@/lib/scenarios/types";
import { DEFAULT_SCENARIO_INPUT } from "@/lib/scenarios/types";
import type { ForecastConfidence, ForecastHorizonDays } from "@/lib/forecasting/types";

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, OK: 1 };

const DOMAIN_PERMISSION: Record<string, Permission> = {
  sales: "sales.read",
  demand: "sales.read",
  materials: "materials.read",
  production: "production.read",
  batches: "batches.read",
  quality: "quality.read",
  delivery: "production.read",
  customer: "traceability.read",
  procurement: "procurement.read",
  inventory: "inventory.read",
  execution: "dashboard.read",
};

export function permittedScenarioDomains(role: string | null): string[] {
  return Object.keys(DOMAIN_PERMISSION).filter((domain) => hasPermission(role, DOMAIN_PERMISSION[domain]!));
}

function filterJourney(stages: JourneyStage[], permitted: string[]): JourneyStage[] {
  return stages.filter((stage) => permitted.includes(stage.id === "customer" ? "customer" : stage.id));
}

function filterImpactChain(links: ImpactChainLink[], permitted: string[]): ImpactChainLink[] {
  return links.filter((link) => {
    if (link.id.startsWith("mat") || link.id === "demand-trigger") return permitted.includes("materials");
    if (link.id === "capacity" || link.id === "delay" || link.id === "delivery") return permitted.includes("production");
    if (link.id === "batch-hold") return permitted.includes("batches");
    if (link.id === "procurement") return permitted.includes("procurement");
    return true;
  });
}

function filterComparison(rows: ScenarioComparisonRow[], permitted: string[]): ScenarioComparisonRow[] {
  return rows.filter((row) => {
    if (row.domain === "Materials") return permitted.includes("materials");
    if (row.domain === "Operations" || row.domain === "Production" || row.domain === "Delivery") return permitted.includes("production");
    if (row.domain === "Procurement") return permitted.includes("procurement");
    return true;
  });
}

function asNumber(value: { toString(): string } | number): number {
  if (typeof value === "number") return value;
  return Number(value.toString());
}

function formatMoney(value: number | null): string | null {
  if (value === null) return null;
  return formatKes(new Prisma.Decimal(value));
}

function worstConfidence(rows: ForecastConfidence[]): ForecastConfidence {
  const rank = { INSUFFICIENT: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
  return rows.reduce((min, row) => (rank[row] < rank[min] ? row : min), "HIGH" as ForecastConfidence);
}

export function resolveScenarioInput(params?: Record<string, string | undefined>): ScenarioInput {
  return parseScenarioInput(params);
}

export function toCompactScenarioContext(snapshot: ScenarioSnapshot): CompactScenarioContext {
  return {
    simulation: "SIMULATED",
    horizon: snapshot.horizonLabel,
    inputs: snapshot.inputs,
    assumptions: snapshot.assumptions.map((row) => ({ label: row.label, change: row.change, supported: row.supported })),
    comparison: snapshot.comparison.slice(0, 8).map((row) => ({
      label: row.label,
      current: row.current,
      scenario: row.scenario,
      variance: row.variance,
    })),
    journey: snapshot.journey.slice(0, 7).map((row) => ({
      stage: row.label,
      metric: row.metric,
      reason: row.reason,
      confidence: row.confidence,
    })),
    impactChain: snapshot.impactChain.slice(0, 8).map((row) => ({ trigger: row.trigger, consequence: row.consequence })),
    decision: {
      headline: snapshot.decision.headline,
      why: snapshot.decision.why,
      tradeOffs: snapshot.decision.tradeOffs,
      limitations: snapshot.decision.limitations,
    },
    impacts: snapshot.impacts.slice(0, 6).map((row) => ({
      domain: row.domain,
      metric: row.metric,
      baseline: row.baseline,
      projected: row.projected,
      delta: row.delta,
      severity: row.severity,
    })),
    risks: snapshot.risks.slice(0, 5).map((row) => ({
      title: row.title,
      severity: row.severity,
      impact: row.impact,
    })),
    excludedDomains: snapshot.excludedDomains,
  };
}

const FORBIDDEN_CONTEXT_KEYS = ["tenantId", "password", "passwordHash", "DATABASE_URL", "token", "email"];

export function sanitizeScenarioContext(context: CompactScenarioContext): CompactScenarioContext {
  const json = JSON.stringify(context);
  for (const key of FORBIDDEN_CONTEXT_KEYS) {
    if (new RegExp(`"${key}"\\s*:`, "i").test(json)) {
      throw new Error("Scenario context contained a forbidden field.");
    }
  }
  if (/postgres:\/\//i.test(json) || /DATABASE_URL/i.test(json)) {
    throw new Error("Scenario context contained a connection string.");
  }
  return context;
}

export function scenarioContextHasForbiddenFields(context: unknown): boolean {
  const json = JSON.stringify(context);
  return FORBIDDEN_CONTEXT_KEYS.some((key) => new RegExp(`"${key}"\\s*:`, "i").test(json));
}

async function loadFacts(
  ctx: TenantContext,
  horizon: ForecastHorizonDays,
  now: Date
): Promise<{ facts: ScenarioBaselineFacts; brand: string; disclaimer: string }> {
  const tenant = await getTenant(ctx);
  const currentWindow = trailingDays(now, horizon);
  const priorWindow = trailingDays(addUtcDays(now, -horizon), horizon);

  const [currentTotals, priorTotals, materials, inventory, operations, procurement, batches, quality, traceability] =
    await Promise.all([
    periodTotals(ctx, currentWindow.start, currentWindow.end),
    periodTotals(ctx, priorWindow.start, priorWindow.end),
    hasPermission(ctx.role, "materials.read")
      ? getMaterialsSnapshot(ctx, resolveMaterialsFilters({ view: "requirements" })).catch(() => null)
      : Promise.resolve(null),
    hasPermission(ctx.role, "inventory.read")
      ? getInventorySnapshot(ctx, resolveInventoryFilters({ view: "overview" })).catch(() => null)
      : Promise.resolve(null),
    hasPermission(ctx.role, "production.read")
      ? getOperationsPlanner(ctx, resolvePlanningWindow({ weeks: operationsWeeksForHorizon(horizon) })).catch(() => null)
      : Promise.resolve(null),
    hasPermission(ctx.role, "procurement.read")
      ? getProcurementSnapshot(ctx, resolveProcurementFilters({ view: "all" })).catch(() => null)
      : Promise.resolve(null),
    hasPermission(ctx.role, "batches.read") ? getBatchesSnapshot(ctx, { view: "all" }).catch(() => null) : Promise.resolve(null),
    hasPermission(ctx.role, "quality.read")
      ? getQualitySnapshot(ctx, resolveQualityFilters({ view: "open" })).catch(() => null)
      : Promise.resolve(null),
    hasPermission(ctx.role, "traceability.read") ? getTraceabilityAttention(ctx).catch(() => []) : Promise.resolve([]),
  ]);
  const execution = hasPermission(ctx.role, "dashboard.read") ? await getExecutionSnapshot(ctx).catch(() => null) : null;
  const qualityOpen = quality?.exceptions ?? [];
  const qualityCritical = qualityOpen.filter((row) => row.severity === "CRITICAL" || row.severity === "HIGH").length;
  const batchesOnHold = batches?.batches.filter((row) => row.qualityStatus === "ON_HOLD").length ?? 0;
  const customerExposure = traceability.filter((row) => /customer|order/i.test(row.title)).length;

  const currentRevenue = asNumber(currentTotals.revenue);
  const priorRevenue = asNumber(priorTotals.revenue);
  const sales = buildMetric({
    metric: "Revenue outlook",
    current: currentRevenue,
    prior: priorRevenue,
    dataPoints: (currentRevenue > 0 ? 1 : 0) + (priorRevenue > 0 ? 1 : 0),
    format: (value) => formatKes(new Prisma.Decimal(value)),
    period: horizonLabel(horizon),
    explanation: "Realized CONFIRMED/FULFILLED run-rate.",
  });
  const rfq = buildMetric({
    metric: "RFQ demand",
    current: currentTotals.rfqs,
    prior: priorTotals.rfqs,
    dataPoints: (currentTotals.rfqs > 0 ? 1 : 0) + (priorTotals.rfqs > 0 ? 1 : 0),
    format: formatCount,
    period: horizonLabel(horizon),
    explanation: "RFQ volume versus the prior window.",
  });

  const utilRaw = operations?.kpis.find((row) => row.id === "utilization")?.value ?? null;
  const productionUtilization = utilRaw ? Number.parseInt(utilRaw, 10) : operations ? 0 : null;
  const dueInHorizon =
    operations?.orders.filter((order) => {
      const due = new Date(order.dueDate).getTime() - now.getTime();
      const days = Math.ceil(due / 86_400_000);
      return days >= 0 && days <= horizon;
    }).length ?? 0;

  return {
    brand: tenant.name,
    disclaimer: tenant.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    facts: {
      revenueOutlook: sales.confidence === "INSUFFICIENT" ? null : asNumber(currentTotals.revenue),
      revenueConfidence: sales.confidence,
      rfqDemand: rfq.confidence === "INSUFFICIENT" ? null : currentTotals.rfqs,
      rfqConfidence: rfq.confidence,
      productionUtilization: Number.isFinite(productionUtilization as number) ? (productionUtilization as number) : null,
      dueInHorizon,
      atRisk: operations?.orders.filter((order) => order.displayStatus === "AT_RISK").length ?? 0,
      unscheduled: operations?.orders.filter((order) => order.displayStatus === "UNSCHEDULED").length ?? 0,
      orders:
        operations?.orders.map((order) => ({
          id: order.id,
          productName: order.productName,
          dueDate: order.dueDate,
          priority: order.priority,
          displayStatus: order.displayStatus,
        })) ?? [],
      materials:
        materials?.materials.map((row) => ({
          productId: row.productId,
          name: row.name,
          available: row.available,
          incoming: row.incoming,
          grossRequirement: row.grossRequirement,
          projectedAvailable: row.projectedAvailable,
          shortage: row.shortage,
          risk: row.risk,
          earliestDueDate: row.earliestDueDate,
          affectedOrderCount: row.affectedOrders.length,
        })) ?? [],
      inventoryItems:
        inventory?.items.map((item) => ({
          id: item.id,
          name: item.name,
          available: item.available,
          required: item.required,
          shortfall: item.shortfall,
          health: item.health,
        })) ?? [],
      pendingRequisitions: procurement?.pendingReviewCount ?? 0,
      executionNeedsReview: execution?.kpis.needsReview ?? 0,
      batchesOnHold,
      qualityOpen: qualityOpen.length,
      qualityCritical,
      customerExposure,
      hasOperations: Boolean(operations),
      hasMaterials: Boolean(materials),
      hasInventory: Boolean(inventory),
      hasProcurement: Boolean(procurement),
      hasExecution: Boolean(execution),
      hasBatches: Boolean(batches),
      hasQuality: Boolean(quality),
      hasTraceability: traceability.length > 0 || hasPermission(ctx.role, "traceability.read"),
    },
  };
}

export async function getScenarioSnapshot(
  ctx: TenantContext,
  input: ScenarioInput = DEFAULT_SCENARIO_INPUT,
  now = new Date()
): Promise<ScenarioSnapshot> {
  const permitted = permittedScenarioDomains(ctx.role);
  const excluded = Object.keys(DOMAIN_PERMISSION).filter((domain) => !permitted.includes(domain));
  const { facts, brand, disclaimer } = await loadFacts(ctx, input.horizon, now);
  const simulated = simulateScenario(facts, input, now);
  const period = horizonLabel(input.horizon);

  const revenueBaseline = formatMoney(facts.revenueOutlook) ?? "Insufficient data for simulation";
  const demandBaseline = facts.rfqDemand === null ? "Insufficient data for simulation" : formatCount(facts.rfqDemand);
  const productionBaseline = facts.productionUtilization === null ? "Insufficient data for simulation" : `${facts.productionUtilization}%`;
  const shortageBaseline = facts.hasMaterials ? formatCount(facts.materials.filter((row) => row.shortage).length) : "Insufficient data for simulation";
  const procurementBaseline = facts.hasProcurement ? formatCount(facts.pendingRequisitions) : "Insufficient data for simulation";

  const impacts: ScenarioImpact[] = [
    {
      id: "sales",
      domain: "sales",
      metric: "Revenue outlook",
      baseline: revenueBaseline,
      projected: facts.revenueOutlook === null ? null : formatMoney(simulated.revenue),
      delta: changeLabel(facts.revenueOutlook, simulated.revenue, "percent"),
      direction: impactDirection(facts.revenueOutlook, simulated.revenue),
      severity: impactSeverity({ baseline: facts.revenueOutlook, scenario: simulated.revenue, worseWhen: "down" }),
      explanation:
        facts.revenueOutlook === null
          ? "Insufficient data for simulation"
          : "Simulated demand applied to the current realized-revenue run-rate. Not recorded revenue.",
      href: "/forecast",
    },
    {
      id: "demand",
      domain: "demand",
      metric: "RFQ demand",
      baseline: demandBaseline,
      projected: facts.rfqDemand === null ? null : simulated.rfq === null ? null : formatCount(simulated.rfq),
      delta: changeLabel(facts.rfqDemand, simulated.rfq, "percent"),
      direction: impactDirection(facts.rfqDemand, simulated.rfq),
      severity: impactSeverity({ baseline: facts.rfqDemand, scenario: simulated.rfq, worseWhen: "up" }),
      explanation:
        facts.rfqDemand === null ? "Insufficient data for simulation" : "RFQ volume scaled by the demand assumption.",
      href: "/dashboard",
    },
    {
      id: "production",
      domain: "production",
      metric: "Production pressure",
      baseline: productionBaseline,
      projected: simulated.utilization === null ? null : `${simulated.utilization}%`,
      delta: changeLabel(facts.productionUtilization, simulated.utilization, "pts"),
      direction: impactDirection(facts.productionUtilization, simulated.utilization),
      severity: impactSeverity({
        baseline: facts.productionUtilization,
        scenario: simulated.utilization,
        worseWhen: "up",
        criticalAt: 100,
      }),
      explanation: facts.hasOperations
        ? `Capacity ${input.productionCapacityChangePct}%, delay ${input.productionDelayDays}d. At-risk ${facts.atRisk} → ${simulated.atRisk}. Simulated only.`
        : "Insufficient data for simulation",
      href: "/operations",
    },
    {
      id: "materials",
      domain: "materials",
      metric: "Material shortages",
      baseline: shortageBaseline,
      projected: facts.hasMaterials ? formatCount(simulated.shortages) : null,
      delta: changeLabel(facts.materials.filter((row) => row.shortage).length, facts.hasMaterials ? simulated.shortages : null, "count"),
      direction: impactDirection(facts.materials.filter((row) => row.shortage).length, facts.hasMaterials ? simulated.shortages : null),
      severity: impactSeverity({
        baseline: facts.hasMaterials ? facts.materials.filter((row) => row.shortage).length : null,
        scenario: facts.hasMaterials ? simulated.shortages : null,
        worseWhen: "up",
        criticalAt: 5,
      }),
      explanation: facts.hasMaterials
        ? "Gross demand, on-hand, and inbound scaled. Existing material engine is not re-run."
        : "Insufficient data for simulation",
      href: "/materials",
    },
    {
      id: "inventory",
      domain: "inventory",
      metric: "Inventory constraint",
      baseline: facts.hasInventory
        ? formatCount(facts.inventoryItems.filter((item) => item.health === "OUT_OF_STOCK" || item.health === "CRITICAL" || item.shortfall > 0).length)
        : "Insufficient data for simulation",
      projected: facts.hasInventory ? formatCount(simulated.constrained) : null,
      delta: changeLabel(
        facts.hasInventory
          ? facts.inventoryItems.filter((item) => item.health === "OUT_OF_STOCK" || item.health === "CRITICAL" || item.shortfall > 0).length
          : null,
        facts.hasInventory ? simulated.constrained : null,
        "count"
      ),
      direction: impactDirection(
        facts.hasInventory
          ? facts.inventoryItems.filter((item) => item.health === "OUT_OF_STOCK" || item.health === "CRITICAL" || item.shortfall > 0).length
          : null,
        facts.hasInventory ? simulated.constrained : null
      ),
      severity: impactSeverity({
        baseline: facts.hasInventory
          ? facts.inventoryItems.filter((item) => item.health === "OUT_OF_STOCK" || item.health === "CRITICAL" || item.shortfall > 0).length
          : null,
        scenario: facts.hasInventory ? simulated.constrained : null,
        worseWhen: "up",
      }),
      explanation: facts.hasInventory
        ? "Usable stock scaled by inventory availability. Simulated, not a stock movement."
        : "Insufficient data for simulation",
      href: "/inventory",
    },
    {
      id: "procurement",
      domain: "procurement",
      metric: "Procurement attention",
      baseline: procurementBaseline,
      projected: facts.hasProcurement ? formatCount(simulated.pendingRequisitions) : null,
      delta: changeLabel(facts.hasProcurement ? facts.pendingRequisitions : null, facts.hasProcurement ? simulated.pendingRequisitions : null, "count"),
      direction: impactDirection(facts.hasProcurement ? facts.pendingRequisitions : null, facts.hasProcurement ? simulated.pendingRequisitions : null),
      severity: impactSeverity({
        baseline: facts.hasProcurement ? facts.pendingRequisitions : null,
        scenario: facts.hasProcurement ? simulated.pendingRequisitions : null,
        worseWhen: "up",
      }),
      explanation: facts.hasProcurement
        ? "Inbound coverage scaled. No requisitions or purchase orders are created."
        : "Insufficient data for simulation",
      href: "/procurement",
    },
    {
      id: "execution",
      domain: "execution",
      metric: "Execution queue pressure",
      baseline: facts.hasExecution ? formatCount(facts.executionNeedsReview) : "Insufficient data for simulation",
      projected: facts.hasExecution ? formatCount(simulated.executionNeedsReview) : null,
      delta: changeLabel(facts.hasExecution ? facts.executionNeedsReview : null, facts.hasExecution ? simulated.executionNeedsReview : null, "count"),
      direction: impactDirection(facts.hasExecution ? facts.executionNeedsReview : null, facts.hasExecution ? simulated.executionNeedsReview : null),
      severity: impactSeverity({
        baseline: facts.hasExecution ? facts.executionNeedsReview : null,
        scenario: facts.hasExecution ? simulated.executionNeedsReview : null,
        worseWhen: "up",
      }),
      explanation: facts.hasExecution
        ? "Simulated attention only. Nothing is queued, approved, or executed."
        : "Insufficient data for simulation",
      href: "/execution",
    },
  ];

  const risks: ScenarioRisk[] = [];
  if (simulated.utilization !== null && facts.productionUtilization !== null && simulated.utilization > facts.productionUtilization) {
    risks.push({
      id: "cap-pressure",
      domain: "production",
      title: "Production capacity pressure increases",
      severity: impactSeverity({
        baseline: facts.productionUtilization,
        scenario: simulated.utilization,
        worseWhen: "up",
        criticalAt: 100,
      }),
      baseline: `${facts.productionUtilization}%`,
      scenario: `${simulated.utilization}%`,
      impact: `Simulated capacity ${changeLabel(facts.productionUtilization, simulated.utilization, "pts")}.`,
      href: "/operations",
    });
  }
  if (simulated.delayedOrders > 0) {
    risks.push({
      id: "delay",
      domain: "production",
      title: "Production delay would miss near-term due dates",
      severity: simulated.delayedOrders >= 3 ? "HIGH" : "MEDIUM",
      baseline: formatCount(facts.atRisk),
      scenario: formatCount(simulated.atRisk),
      impact: `${formatCount(simulated.delayedOrders)} order${simulated.delayedOrders === 1 ? "" : "s"} would miss due dates under a ${input.productionDelayDays}-day delay.`,
      href: "/operations",
    });
  }
  if (simulated.deprioritized > 0) {
    risks.push({
      id: "priority",
      domain: "production",
      title: "Non-critical orders would wait under critical priority",
      severity: "MEDIUM",
      baseline: "Current priorities",
      scenario: "Critical first",
      impact: `${formatCount(simulated.deprioritized)} non-critical order${simulated.deprioritized === 1 ? "" : "s"} due in the horizon would be deprioritized.`,
      href: "/operations",
    });
  }
  for (const row of simulated.newlyShortMaterials.slice(0, 3)) {
    risks.push({
      id: `mat-${row.productId}`,
      domain: "materials",
      title: `${row.name} shortage risk increases`,
      severity: "HIGH",
      baseline: "Covered or tight",
      scenario: "Simulated shortage",
      impact: "Demand, stock, or inbound assumptions would push projected availability below requirement.",
      href: `/materials?material=${row.productId}`,
    });
  }
  if (facts.hasMaterials && simulated.shortages > facts.materials.filter((row) => row.shortage).length) {
    risks.push({
      id: "mat-count",
      domain: "materials",
      title: "Material shortage pressure increases",
      severity: simulated.shortages >= 5 ? "CRITICAL" : "HIGH",
      baseline: formatCount(facts.materials.filter((row) => row.shortage).length),
      scenario: formatCount(simulated.shortages),
      impact: changeLabel(facts.materials.filter((row) => row.shortage).length, simulated.shortages, "count"),
      href: "/materials",
    });
  }
  if (facts.hasInventory) {
    const baseConstrained = facts.inventoryItems.filter(
      (item) => item.health === "OUT_OF_STOCK" || item.health === "CRITICAL" || item.shortfall > 0
    ).length;
    if (simulated.constrained > baseConstrained) {
      risks.push({
        id: "inv",
        domain: "inventory",
        title: "Inventory constraint widens",
        severity: "MEDIUM",
        baseline: formatCount(baseConstrained),
        scenario: formatCount(simulated.constrained),
        impact: "Lower availability or higher demand would constrain more items.",
        href: "/inventory?view=health",
      });
    }
  }
  if (facts.hasProcurement && simulated.pendingRequisitions > facts.pendingRequisitions) {
    risks.push({
      id: "proc",
      domain: "procurement",
      title: "Procurement attention increases",
      severity: "LOW",
      baseline: formatCount(facts.pendingRequisitions),
      scenario: formatCount(simulated.pendingRequisitions),
      impact: "Additional shortage exposure would add review pressure. No buying is triggered.",
      href: "/procurement",
    });
  }
  if (facts.hasExecution && simulated.executionNeedsReview > facts.executionNeedsReview) {
    risks.push({
      id: "exec",
      domain: "execution",
      title: "Execution queue pressure may increase",
      severity: "LOW",
      baseline: formatCount(facts.executionNeedsReview),
      scenario: formatCount(simulated.executionNeedsReview),
      impact: "Watch existing review items. This simulation does not create work.",
      href: "/execution",
    });
  }

  risks.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.id.localeCompare(b.id));

  const recommendations = [
    simulated.utilization !== null && simulated.utilization >= 90 ? "Watch operations capacity before committing more workload." : null,
    simulated.shortages > facts.materials.filter((row) => row.shortage).length
      ? "Review material coverage for items that become short under this assumption."
      : null,
    simulated.delayedOrders > 0 ? "Inspect due dates that a production delay would miss." : null,
    simulated.pendingRequisitions > facts.pendingRequisitions ? "Procurement review pressure would rise — still planning only." : null,
    input.priorityMode === "critical" ? "Critical-first mode would defer non-critical due dates in this horizon." : null,
  ]
    .filter((row): row is string => Boolean(row))
    .slice(0, 5);

  const revenueSeries = facts.revenueOutlook ?? 0;
  const series = [
    { label: "Revenue", baseline: revenueSeries, scenario: simulated.revenue ?? revenueSeries },
    {
      label: "Capacity",
      baseline: facts.productionUtilization ?? 0,
      scenario: simulated.utilization ?? facts.productionUtilization ?? 0,
    },
    {
      label: "Shortages",
      baseline: facts.materials.filter((row) => row.shortage).length,
      scenario: simulated.shortages,
    },
  ];

  const assumptions = buildAssumptionRows(input);
  const comparison = filterComparison(buildComparisonRows(facts, simulated, formatCount), permitted);
  const journey = filterJourney(buildOperationalJourney(facts, simulated, input, formatCount), permitted);
  const impactChain = filterImpactChain(buildImpactChain(facts, simulated, input, formatCount), permitted);
  const decision = buildScenarioDecision({ facts, simulated, scenarioInput: input, risks, formatCount });

  return {
    brand,
    disclaimer,
    generatedAt: now.toISOString(),
    horizon: input.horizon,
    horizonLabel: period,
    inputs: input,
    simulationOnly: true,
    openaiCallsOnLoad: 0,
    statusLabel: isIdentityScenario(input) ? "Baseline matches current plan" : "Scenario calculated",
    baseline: {
      revenue: revenueBaseline,
      demand: demandBaseline,
      production: productionBaseline,
      shortages: shortageBaseline,
      procurement: procurementBaseline,
    },
    scenario: {
      revenue: facts.revenueOutlook === null ? null : formatMoney(simulated.revenue),
      demand: facts.rfqDemand === null ? null : simulated.rfq === null ? null : formatCount(simulated.rfq),
      production: simulated.utilization === null ? null : `${simulated.utilization}%`,
      shortages: facts.hasMaterials ? formatCount(simulated.shortages) : null,
      procurement: facts.hasProcurement ? formatCount(simulated.pendingRequisitions) : null,
    },
    impacts,
    risks: risks.filter((row) => row.severity !== "OK").slice(0, 8),
    recommendations,
    dataConfidence: worstConfidence([
      facts.revenueConfidence,
      facts.rfqConfidence,
      facts.hasOperations ? "MEDIUM" : "INSUFFICIENT",
      facts.hasMaterials ? "MEDIUM" : "INSUFFICIENT",
    ]),
    series,
    assumptions,
    comparison,
    journey,
    impactChain,
    decision,
    excludedDomains: excluded,
    planningNote:
      "Simulation only. Assumptions are applied to a copy of current domain values. Real orders, inventory, schedules, and procurement are unchanged. No model calls on load or run.",
  };
}

export async function getPlanningOutlook(ctx: TenantContext): Promise<PlanningOutlook> {
  const baseline = await getScenarioSnapshot(ctx, DEFAULT_SCENARIO_INPUT);
  const surge = await getScenarioSnapshot(ctx, { ...DEFAULT_SCENARIO_INPUT, demandChangePct: 20 });
  const topRisk = baseline.risks[0]?.title ?? baseline.decision.headline;
  const capacityDelta = surge.comparison.find((row) => row.id === "capacity");
  return {
    currentState: baseline.baseline.production === "Insufficient data for simulation"
      ? "Operational baseline loaded from authorized domains."
      : `Capacity ${baseline.baseline.production} · ${baseline.baseline.shortages} material shortages`,
    topRisk,
    scenarioOpportunity: "+20% demand scenario available for inspection",
    projectedImpact: capacityDelta
      ? `Capacity ${capacityDelta.scenario} (${capacityDelta.variance}) under demand surge`
      : surge.decision.headline,
    href: "/scenarios?demand=20",
  };
}

export async function getScenarioPlanningSlice(ctx: TenantContext): Promise<{
  baselineLabel: string;
  scenarioLabel: string;
  rows: ScenarioComparisonRow[];
  href: string;
}> {
  const baseline = await getScenarioSnapshot(ctx, DEFAULT_SCENARIO_INPUT);
  const surge = await getScenarioSnapshot(ctx, { ...DEFAULT_SCENARIO_INPUT, demandChangePct: 20 });
  return {
    baselineLabel: "Current plan",
    scenarioLabel: "+20% demand",
    rows: surge.comparison.slice(0, 5),
    href: "/scenarios?demand=20",
  };
}
