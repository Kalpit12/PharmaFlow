import type {
  ScenarioBaselineFacts,
  ScenarioDecision,
  ScenarioInput,
  ScenarioRisk,
  ScenarioSimulation,
} from "@/lib/scenarios/types";

export function buildScenarioDecision(input: {
  facts: ScenarioBaselineFacts;
  simulated: ScenarioSimulation;
  scenarioInput: ScenarioInput;
  risks: ScenarioRisk[];
  formatCount: (n: number) => string;
}): ScenarioDecision {
  const { facts, simulated, scenarioInput, risks, formatCount } = input;
  const top = risks[0];
  const utilizationUp =
    simulated.utilization !== null && facts.productionUtilization !== null && simulated.utilization > facts.productionUtilization;
  const shortagesUp = facts.hasMaterials && simulated.shortages > facts.materials.filter((row) => row.shortage).length;
  const atRiskUp = simulated.atRisk > facts.atRisk;

  let headline = "Scenario aligns with current plan";
  if (utilizationUp && simulated.utilization !== null && simulated.utilization >= 90) headline = "Higher capacity required";
  else if (shortagesUp) headline = "Material pressure increases";
  else if (atRiskUp) headline = "Production and delivery exposure increases";
  else if (top) headline = top.title;

  const why: string[] = [];
  if (utilizationUp && simulated.utilization !== null) {
    why.push(`Capacity reaches ${simulated.utilization}% under the scenario assumption.`);
  }
  if (atRiskUp) {
    why.push(`${formatCount(simulated.atRisk - facts.atRisk)} additional production order${simulated.atRisk - facts.atRisk === 1 ? "" : "s"} become exposed.`);
  }
  if (shortagesUp) {
    why.push(`${formatCount(simulated.shortages)} material shortage${simulated.shortages === 1 ? "" : "s"} vs ${formatCount(facts.materials.filter((row) => row.shortage).length)} today.`);
  }
  if (simulated.delayedOrders > 0) {
    why.push(`${formatCount(simulated.delayedOrders)} order${simulated.delayedOrders === 1 ? "" : "s"} would miss near-term due dates.`);
  }
  if (why.length === 0 && top) why.push(top.impact);
  if (why.length === 0) why.push("Assumptions do not materially shift the operational graph.");

  const tradeOffs: string[] = [];
  if (utilizationUp) tradeOffs.push("Higher utilization reduces schedule buffer.");
  if (shortagesUp) tradeOffs.push("Material pressure may require procurement review before committing volume.");
  if (scenarioInput.demandChangePct > 0) tradeOffs.push("Demand upside increases revenue outlook but tightens supply cover.");
  if (scenarioInput.productionCapacityChangePct < 0) tradeOffs.push("Lower effective capacity concentrates work on fewer hours.");
  if (scenarioInput.priorityMode === "critical") tradeOffs.push("Critical-first mode defers non-critical due dates in the horizon.");
  if (tradeOffs.length === 0) tradeOffs.push("No major trade-off identified under current assumptions.");

  const limitations: string[] = ["Scenario projections are simulated — live orders, inventory, and schedules are unchanged."];
  limitations.push("Workforce availability is not recorded; capacity assumptions proxy workload only.");
  if (!facts.hasTraceability || facts.customerExposure === 0) {
    limitations.push("Batch-level customer allocation is not recorded; customer impact is partial.");
  }
  if (scenarioInput.productionDelayDays === 0 && scenarioInput.demandChangePct === 0 && scenarioInput.productionCapacityChangePct === 0) {
    limitations.push("Identity scenario — adjust assumptions to explore change.");
  }

  const reviewLinks = [
    facts.hasOperations ? { label: "Review production", href: "/operations" } : null,
    facts.hasMaterials ? { label: "Review materials", href: "/materials?view=shortages" } : null,
    facts.hasProcurement ? { label: "Review procurement", href: "/procurement" } : null,
    facts.hasQuality ? { label: "Review quality", href: "/quality?view=open" } : null,
  ].filter((row): row is { label: string; href: string } => Boolean(row));

  return { headline, why, tradeOffs, limitations, reviewLinks };
}

export function fallbackScenarioExplanation(input: {
  decision: ScenarioDecision;
  question: string;
}): import("@/lib/scenarios/types").ScenarioExplanation {
  return {
    summary: input.decision.headline,
    keyDrivers: input.decision.why,
    impact: input.decision.tradeOffs,
    tradeOffs: input.decision.tradeOffs,
    limitations: [
      ...input.decision.limitations,
      input.question.trim() ? `Answered deterministically for: ${input.question.slice(0, 160)}` : "Deterministic scenario explanation.",
      "AI explanation was not available; no figures were invented.",
    ],
    source: "deterministic",
  };
}
