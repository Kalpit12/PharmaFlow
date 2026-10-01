import { changeLabel, impactSeverity } from "@/lib/scenarios/engine";
import type {
  ImpactChainLink,
  JourneyStage,
  ScenarioBaselineFacts,
  ScenarioComparisonRow,
  ScenarioInput,
  ScenarioSeverity,
  ScenarioSimulation,
} from "@/lib/scenarios/types";

function stageSeverity(input: {
  baseline: number | null;
  scenario: number | null;
  worseWhen: "up" | "down";
  criticalAt?: number;
}): ScenarioSeverity {
  return impactSeverity(input);
}

function fmtCount(value: number | null, formatter: (n: number) => string): string {
  if (value === null) return "Insufficient data";
  return formatter(value);
}

export function buildAssumptionRows(input: ScenarioInput) {
  return [
    {
      id: "demand",
      label: "Demand",
      current: "0%",
      scenario: `${input.demandChangePct > 0 ? "+" : ""}${input.demandChangePct}%`,
      change: input.demandChangePct === 0 ? "No change" : `${input.demandChangePct > 0 ? "+" : ""}${input.demandChangePct}%`,
      supported: true,
    },
    {
      id: "capacity",
      label: "Capacity",
      current: "0%",
      scenario: `${input.productionCapacityChangePct > 0 ? "+" : ""}${input.productionCapacityChangePct}%`,
      change:
        input.productionCapacityChangePct === 0 ? "No change" : `${input.productionCapacityChangePct > 0 ? "+" : ""}${input.productionCapacityChangePct}%`,
      supported: true,
    },
    {
      id: "inventory",
      label: "Inventory availability",
      current: "0%",
      scenario: `${input.inventoryAvailabilityChangePct > 0 ? "+" : ""}${input.inventoryAvailabilityChangePct}%`,
      change:
        input.inventoryAvailabilityChangePct === 0
          ? "No change"
          : `${input.inventoryAvailabilityChangePct > 0 ? "+" : ""}${input.inventoryAvailabilityChangePct}%`,
      supported: true,
    },
    {
      id: "supplier",
      label: "Supplier / inbound cover",
      current: "0%",
      scenario: `${input.procurementAvailabilityChangePct > 0 ? "+" : ""}${input.procurementAvailabilityChangePct}%`,
      change:
        input.procurementAvailabilityChangePct === 0
          ? "No change"
          : `${input.procurementAvailabilityChangePct > 0 ? "+" : ""}${input.procurementAvailabilityChangePct}%`,
      supported: true,
    },
    {
      id: "delay",
      label: "Production delay",
      current: "0 days",
      scenario: `${input.productionDelayDays} days`,
      change: input.productionDelayDays === 0 ? "No change" : `${input.productionDelayDays} day${input.productionDelayDays === 1 ? "" : "s"}`,
      supported: true,
    },
    {
      id: "workforce",
      label: "Workforce",
      current: "Not recorded",
      scenario: "Not recorded",
      change: "Uses capacity adjustment only",
      supported: false,
    },
    {
      id: "priority",
      label: "Priority mode",
      current: "Current",
      scenario: input.priorityMode === "critical" ? "Critical first" : "Current",
      change: input.priorityMode === "critical" ? "Critical first" : "No change",
      supported: true,
    },
  ];
}

export function buildComparisonRows(
  facts: ScenarioBaselineFacts,
  simulated: ScenarioSimulation,
  formatCount: (n: number) => string
): ScenarioComparisonRow[] {
  const shortageBaseline = facts.hasMaterials ? facts.materials.filter((row) => row.shortage).length : null;
  const productionOrders = facts.orders.length;
  const projectedAtRisk = simulated.atRisk;

  return [
    {
      id: "production-orders",
      domain: "Operations",
      label: "Production orders at risk",
      current: facts.hasOperations ? formatCount(facts.atRisk) : "Insufficient data",
      scenario: facts.hasOperations ? formatCount(projectedAtRisk) : "Insufficient data",
      variance: changeLabel(facts.atRisk, facts.hasOperations ? projectedAtRisk : null, "count"),
    },
    {
      id: "capacity",
      domain: "Operations",
      label: "Capacity utilization",
      current: facts.productionUtilization === null ? "Insufficient data" : `${facts.productionUtilization}%`,
      scenario: simulated.utilization === null ? "Insufficient data" : `${simulated.utilization}%`,
      variance: changeLabel(facts.productionUtilization, simulated.utilization, "pts"),
    },
    {
      id: "material-risk",
      domain: "Materials",
      label: "Material shortages",
      current: shortageBaseline === null ? "Insufficient data" : formatCount(shortageBaseline),
      scenario: facts.hasMaterials ? formatCount(simulated.shortages) : "Insufficient data",
      variance: changeLabel(shortageBaseline, facts.hasMaterials ? simulated.shortages : null, "count"),
    },
    {
      id: "procurement",
      domain: "Procurement",
      label: "Procurement attention",
      current: facts.hasProcurement ? formatCount(facts.pendingRequisitions) : "Insufficient data",
      scenario: facts.hasProcurement ? formatCount(simulated.pendingRequisitions) : "Insufficient data",
      variance: changeLabel(
        facts.hasProcurement ? facts.pendingRequisitions : null,
        facts.hasProcurement ? simulated.pendingRequisitions : null,
        "count"
      ),
    },
    {
      id: "delivery",
      domain: "Delivery",
      label: "Delivery exposure",
      current: facts.hasOperations ? formatCount(facts.atRisk) : "Insufficient data",
      scenario: facts.hasOperations ? formatCount(simulated.atRisk + simulated.delayedOrders) : "Insufficient data",
      variance: changeLabel(
        facts.atRisk,
        facts.hasOperations ? simulated.atRisk + simulated.delayedOrders : null,
        "count"
      ),
    },
    {
      id: "orders",
      domain: "Production",
      label: "Orders in horizon",
      current: facts.hasOperations ? formatCount(productionOrders) : "Insufficient data",
      scenario: facts.hasOperations ? formatCount(productionOrders) : "Insufficient data",
      variance: "0",
    },
  ];
}

export function buildOperationalJourney(
  facts: ScenarioBaselineFacts,
  simulated: ScenarioSimulation,
  input: ScenarioInput,
  formatCount: (n: number) => string
): JourneyStage[] {
  const shortageBaseline = facts.hasMaterials ? facts.materials.filter((row) => row.shortage).length : null;
  const deliveryExposure = simulated.atRisk + simulated.delayedOrders;

  return [
    {
      id: "demand",
      label: "Demand",
      status: stageSeverity({
        baseline: facts.rfqDemand,
        scenario: simulated.rfq,
        worseWhen: "up",
      }),
      metric: facts.rfqDemand === null ? "Insufficient data" : `${formatCount(facts.rfqDemand)} RFQs`,
      reason:
        facts.rfqDemand === null
          ? "Insufficient RFQ history for this horizon."
          : input.demandChangePct === 0
            ? "Demand assumption unchanged."
            : `RFQ volume scaled by ${input.demandChangePct > 0 ? "+" : ""}${input.demandChangePct}%.`,
      baseline: facts.rfqDemand === null ? "Insufficient data" : formatCount(facts.rfqDemand),
      projected: simulated.rfq === null ? "Insufficient data" : formatCount(simulated.rfq),
      delta: changeLabel(facts.rfqDemand, simulated.rfq, "percent"),
      href: "/dashboard",
      confidence: facts.rfqDemand === null ? "INSUFFICIENT_DATA" : "KNOWN",
    },
    {
      id: "materials",
      label: "Materials",
      status: stageSeverity({
        baseline: shortageBaseline,
        scenario: facts.hasMaterials ? simulated.shortages : null,
        worseWhen: "up",
        criticalAt: 5,
      }),
      metric: facts.hasMaterials ? `${formatCount(simulated.shortages)} shortage${simulated.shortages === 1 ? "" : "s"}` : "Insufficient data",
      reason: facts.hasMaterials
        ? simulated.newlyShortMaterials.length > 0
          ? `${simulated.newlyShortMaterials[0]?.name ?? "Material"} projected below requirement under scenario assumptions.`
          : simulated.shortages > (shortageBaseline ?? 0)
            ? "Demand, inventory, or inbound assumptions increase material pressure."
            : "Material cover stable under current assumptions."
        : "Materials workspace unavailable.",
      baseline: shortageBaseline === null ? "Insufficient data" : formatCount(shortageBaseline),
      projected: facts.hasMaterials ? formatCount(simulated.shortages) : "Insufficient data",
      delta: changeLabel(shortageBaseline, facts.hasMaterials ? simulated.shortages : null, "count"),
      href: "/materials?view=shortages",
      confidence: facts.hasMaterials ? "KNOWN" : "INSUFFICIENT_DATA",
    },
    {
      id: "production",
      label: "Production",
      status: stageSeverity({
        baseline: facts.productionUtilization,
        scenario: simulated.utilization,
        worseWhen: "up",
        criticalAt: 95,
      }),
      metric:
        simulated.utilization === null
          ? "Insufficient data"
          : `${simulated.utilization}% utilization · ${formatCount(simulated.atRisk)} at risk`,
      reason: facts.hasOperations
        ? input.productionDelayDays > 0
          ? `${formatCount(simulated.delayedOrders)} order${simulated.delayedOrders === 1 ? "" : "s"} would miss near-term due dates under a ${input.productionDelayDays}-day delay.`
          : simulated.utilization !== null && facts.productionUtilization !== null && simulated.utilization > facts.productionUtilization
            ? "Capacity pressure rises under the scenario assumption."
            : simulated.atRisk > facts.atRisk
              ? "More production orders become exposed."
              : "Production schedule stable under assumptions."
        : "Operations planner unavailable.",
      baseline: facts.productionUtilization === null ? "Insufficient data" : `${facts.productionUtilization}%`,
      projected: simulated.utilization === null ? "Insufficient data" : `${simulated.utilization}%`,
      delta: changeLabel(facts.productionUtilization, simulated.utilization, "pts"),
      href: "/operations",
      confidence: facts.hasOperations ? "KNOWN" : "INSUFFICIENT_DATA",
    },
    {
      id: "batches",
      label: "Batches",
      status: facts.batchesOnHold > 0 || simulated.shortages > (shortageBaseline ?? 0) ? "HIGH" : "OK",
      metric: facts.hasBatches ? `${formatCount(facts.batchesOnHold)} on hold` : "Insufficient data",
      reason: facts.hasBatches
        ? facts.batchesOnHold > 0
          ? "Existing batch holds remain; scenario does not auto-release quality decisions."
          : simulated.shortages > (shortageBaseline ?? 0)
            ? "Upstream material pressure may threaten future batch output."
            : "No batch hold pressure recorded."
        : "Batch workspace unavailable.",
      baseline: facts.hasBatches ? formatCount(facts.batchesOnHold) : "Insufficient data",
      projected: facts.hasBatches ? formatCount(facts.batchesOnHold) : "Insufficient data",
      delta: "0",
      href: "/batches",
      confidence: facts.hasBatches ? "KNOWN" : "INSUFFICIENT_DATA",
    },
    {
      id: "quality",
      label: "Quality",
      status: facts.qualityCritical > 0 ? "CRITICAL" : facts.qualityOpen > 0 ? "MEDIUM" : "OK",
      metric: facts.hasQuality ? `${formatCount(facts.qualityOpen)} open exception${facts.qualityOpen === 1 ? "" : "s"}` : "Insufficient data",
      reason: facts.hasQuality
        ? facts.qualityCritical > 0
          ? `${formatCount(facts.qualityCritical)} high-severity exception${facts.qualityCritical === 1 ? "" : "s"} remain open. Scenario does not close them.`
          : facts.qualityOpen > 0
            ? "Open quality work continues alongside scenario assumptions."
            : "No open quality exceptions in authorized view."
        : "Quality workspace unavailable.",
      baseline: facts.hasQuality ? formatCount(facts.qualityOpen) : "Insufficient data",
      projected: facts.hasQuality ? formatCount(facts.qualityOpen) : "Insufficient data",
      delta: "0",
      href: "/quality?view=open",
      confidence: facts.hasQuality ? "KNOWN" : "INSUFFICIENT_DATA",
    },
    {
      id: "delivery",
      label: "Delivery",
      status: stageSeverity({
        baseline: facts.atRisk,
        scenario: facts.hasOperations ? deliveryExposure : null,
        worseWhen: "up",
      }),
      metric: facts.hasOperations ? `${formatCount(deliveryExposure)} exposed order${deliveryExposure === 1 ? "" : "s"}` : "Insufficient data",
      reason: facts.hasOperations
        ? simulated.delayedOrders > 0
          ? "Production delay assumption pushes near-term due dates into exposure."
          : simulated.atRisk > facts.atRisk
            ? "More scheduled orders become at risk."
            : "Delivery buffer unchanged under assumptions."
        : "Operations data unavailable.",
      baseline: facts.hasOperations ? formatCount(facts.atRisk) : "Insufficient data",
      projected: facts.hasOperations ? formatCount(deliveryExposure) : "Insufficient data",
      delta: changeLabel(facts.atRisk, facts.hasOperations ? deliveryExposure : null, "count"),
      href: "/operations",
      confidence: facts.hasOperations ? "KNOWN" : "INSUFFICIENT_DATA",
    },
    {
      id: "customer",
      label: "Customer impact",
      status: facts.customerExposure > 0 || simulated.atRisk > facts.atRisk ? "MEDIUM" : "OK",
      metric:
        facts.hasTraceability && facts.customerExposure > 0
          ? `${formatCount(facts.customerExposure)} product-matched signal${facts.customerExposure === 1 ? "" : "s"}`
          : simulated.atRisk > facts.atRisk
            ? `${formatCount(simulated.atRisk - facts.atRisk)} additional production exposure`
            : "No confirmed batch allocation",
      reason:
        facts.hasTraceability && facts.customerExposure > 0
          ? "Customer exposure is product-matched only — batch-to-order allocation is not recorded."
          : simulated.atRisk > facts.atRisk
            ? "Downstream customer impact is inferred through production exposure, not confirmed genealogy."
            : "Insufficient data for confirmed customer allocation.",
      baseline: facts.hasTraceability ? formatCount(facts.customerExposure) : "Insufficient data",
      projected:
        simulated.atRisk > facts.atRisk
          ? formatCount(Math.max(facts.customerExposure, simulated.atRisk - facts.atRisk))
          : facts.hasTraceability
            ? formatCount(facts.customerExposure)
            : "Insufficient data",
      delta: changeLabel(facts.customerExposure, simulated.atRisk > facts.atRisk ? Math.max(facts.customerExposure, simulated.atRisk - facts.atRisk) : facts.customerExposure, "count"),
      href: "/traceability",
      confidence: "PARTIAL",
    },
  ];
}

export function buildImpactChain(
  facts: ScenarioBaselineFacts,
  simulated: ScenarioSimulation,
  input: ScenarioInput,
  formatCount: (n: number) => string
): ImpactChainLink[] {
  const links: ImpactChainLink[] = [];

  if (input.demandChangePct !== 0) {
    links.push({
      id: "demand-trigger",
      trigger: `${input.demandChangePct > 0 ? "+" : ""}${input.demandChangePct}% demand`,
      consequence: "Material gross requirement increases against current on-hand and inbound cover.",
      severity: input.demandChangePct >= 20 ? "HIGH" : "MEDIUM",
      href: "/materials",
    });
  }

  if (simulated.newlyShortMaterials.length > 0) {
    const material = simulated.newlyShortMaterials[0]!;
    links.push({
      id: `mat-${material.productId}`,
      trigger: `${material.name} projected below requirement`,
      consequence: `${formatCount(simulated.newlyShortMaterials.length)} material path${simulated.newlyShortMaterials.length === 1 ? "" : "s"} would become short under scenario assumptions.`,
      severity: "HIGH",
      href: `/materials?material=${material.productId}`,
    });
  } else if (simulated.shortages > facts.materials.filter((row) => row.shortage).length) {
    links.push({
      id: "mat-pressure",
      trigger: "Material shortage count increases",
      consequence: `${formatCount(simulated.shortages)} materials would be short vs ${formatCount(facts.materials.filter((row) => row.shortage).length)} today.`,
      severity: simulated.shortages >= 5 ? "CRITICAL" : "HIGH",
      href: "/materials?view=shortages",
    });
  }

  if (simulated.utilization !== null && facts.productionUtilization !== null && simulated.utilization > facts.productionUtilization) {
    links.push({
      id: "capacity",
      trigger: `Capacity reaches ${simulated.utilization}%`,
      consequence: `${formatCount(simulated.atRisk)} production order${simulated.atRisk === 1 ? "" : "s"} exposed under finite-capacity pressure.`,
      severity: simulated.utilization >= 95 ? "CRITICAL" : "HIGH",
      href: "/operations?view=capacity",
    });
  }

  if (simulated.delayedOrders > 0) {
    links.push({
      id: "delay",
      trigger: `${input.productionDelayDays}-day production delay`,
      consequence: `${formatCount(simulated.delayedOrders)} near-term order${simulated.delayedOrders === 1 ? "" : "s"} would miss due dates.`,
      severity: simulated.delayedOrders >= 3 ? "HIGH" : "MEDIUM",
      href: "/operations",
    });
  }

  if (simulated.atRisk > facts.atRisk) {
    links.push({
      id: "delivery",
      trigger: "Production exposure increases",
      consequence: "Delivery buffer narrows for scheduled orders in the planning horizon.",
      severity: "HIGH",
      href: "/operations",
    });
  }

  if (facts.batchesOnHold > 0) {
    links.push({
      id: "batch-hold",
      trigger: `${formatCount(facts.batchesOnHold)} batch${facts.batchesOnHold === 1 ? "" : "es"} on quality hold`,
      consequence: "Release remains a human quality decision; scenario does not clear holds.",
      severity: "MEDIUM",
      href: "/batches",
    });
  }

  if (simulated.pendingRequisitions > facts.pendingRequisitions) {
    links.push({
      id: "procurement",
      trigger: "Procurement review pressure increases",
      consequence: "Additional material exposure would add review load. No purchase orders are created.",
      severity: "LOW",
      href: "/procurement",
    });
  }

  if (links.length === 0) {
    links.push({
      id: "stable",
      trigger: "Scenario assumptions match current plan",
      consequence: "No material cross-domain shift under the selected assumptions.",
      severity: "OK",
      href: "/scenarios",
    });
  }

  return links;
}
