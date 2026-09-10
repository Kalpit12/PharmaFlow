import { daysUntil, parseForecastHorizon, roundQty } from "@/lib/forecasting/engine";
import type { ForecastHorizonDays } from "@/lib/forecasting/types";
import type {
  CapacityChangePct,
  DelayDays,
  DemandChangePct,
  InventoryChangePct,
  PriorityMode,
  ProcurementChangePct,
  ScenarioBaselineFacts,
  ScenarioInput,
  ScenarioInventoryFact,
  ScenarioMaterialFact,
  ScenarioOrderFact,
  ScenarioSeverity,
  ScenarioSimulation,
} from "@/lib/scenarios/types";
import {
  CAPACITY_PCTS,
  DEFAULT_SCENARIO_INPUT,
  DELAY_DAYS,
  DEMAND_PCTS,
  INVENTORY_PCTS,
  PRIORITY_MODES,
  PROCUREMENT_PCTS,
} from "@/lib/scenarios/types";

function pickAllowed<T extends readonly number[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const n = Number(value);
  return (allowed as readonly number[]).includes(n) ? (n as T[number]) : fallback;
}

export function factorFromPct(pct: number): number {
  return 1 + pct / 100;
}

export function encodeScenarioInput(input: ScenarioInput): string {
  return [
    input.horizon,
    input.demandChangePct,
    input.productionCapacityChangePct,
    input.productionDelayDays,
    input.inventoryAvailabilityChangePct,
    input.procurementAvailabilityChangePct,
    input.priorityMode,
  ].join("|");
}

export function parseScenarioInput(raw?: {
  horizon?: string;
  demand?: string;
  capacity?: string;
  delay?: string;
  inventory?: string;
  procurement?: string;
  priority?: string;
}): ScenarioInput {
  const horizon = parseForecastHorizon(raw?.horizon);
  const priority = raw?.priority === "critical" ? "critical" : "current";
  return {
    horizon,
    demandChangePct: pickAllowed(raw?.demand, DEMAND_PCTS, 0) as DemandChangePct,
    productionCapacityChangePct: pickAllowed(raw?.capacity, CAPACITY_PCTS, 0) as CapacityChangePct,
    productionDelayDays: pickAllowed(raw?.delay, DELAY_DAYS, 0) as DelayDays,
    inventoryAvailabilityChangePct: pickAllowed(raw?.inventory, INVENTORY_PCTS, 0) as InventoryChangePct,
    procurementAvailabilityChangePct: pickAllowed(raw?.procurement, PROCUREMENT_PCTS, 0) as ProcurementChangePct,
    priorityMode: (PRIORITY_MODES.includes(priority as PriorityMode) ? priority : "current") as PriorityMode,
  };
}

export function parseScenarioFromQuestion(question: string): ScenarioInput {
  const q = question.toLowerCase();
  const num = (key: string) => {
    const match = new RegExp(`${key}\\s*=\\s*(-?\\d+)`).exec(q);
    return match?.[1];
  };
  const priority = /\bpriority\s*=\s*critical\b/.test(q) ? "critical" : "current";
  return parseScenarioInput({
    horizon: num("horizon"),
    demand: num("demand"),
    capacity: num("capacity"),
    delay: num("delay"),
    inventory: num("inventory"),
    procurement: num("procurement"),
    priority,
  });
}

export function parseScenarioFromLabel(label?: string | null): ScenarioInput {
  if (!label || !label.includes("|")) return { ...DEFAULT_SCENARIO_INPUT, horizon: parseForecastHorizon(label) };
  const [horizon, demand, capacity, delay, inventory, procurement, priority] = label.split("|");
  return parseScenarioInput({ horizon, demand, capacity, delay, inventory, procurement, priority });
}

export function isIdentityScenario(input: ScenarioInput): boolean {
  return (
    input.demandChangePct === 0 &&
    input.productionCapacityChangePct === 0 &&
    input.productionDelayDays === 0 &&
    input.inventoryAvailabilityChangePct === 0 &&
    input.procurementAvailabilityChangePct === 0 &&
    input.priorityMode === "current"
  );
}

export function changeLabel(baseline: number | null, scenario: number | null, unit: "pts" | "count" | "percent"): string {
  if (baseline === null || scenario === null) return "—";
  if (baseline === 0) return scenario === 0 ? "0" : "—";
  const delta = scenario - baseline;
  if (Math.abs(delta) < 1e-9) return "0";
  if (unit === "pts") {
    const pts = Math.round(delta);
    return `${pts > 0 ? "+" : ""}${pts} pts`;
  }
  if (unit === "count") {
    const n = Math.round(delta);
    return `${n > 0 ? "+" : ""}${n}`;
  }
  const pct = (delta / baseline) * 100;
  const abs = Math.abs(pct).toFixed(1);
  return `${pct >= 0 ? "+" : "−"}${abs}%`;
}

export function impactDirection(baseline: number | null, scenario: number | null): "up" | "down" | "stable" | "unknown" {
  if (baseline === null || scenario === null) return "unknown";
  if (baseline === 0 && scenario !== 0) return "unknown";
  const delta = scenario - baseline;
  if (Math.abs(delta) < 1e-9) return "stable";
  if (baseline === 0) return "unknown";
  const rel = Math.abs(delta) / Math.abs(baseline);
  if (rel < 0.03) return "stable";
  return delta > 0 ? "up" : "down";
}

export function impactSeverity(input: {
  baseline: number | null;
  scenario: number | null;
  worseWhen: "up" | "down";
  criticalAt?: number;
}): ScenarioSeverity {
  const { baseline, scenario, worseWhen, criticalAt } = input;
  if (baseline === null || scenario === null) return "OK";
  if (criticalAt !== undefined && scenario >= criticalAt) return "CRITICAL";
  const delta = scenario - baseline;
  const worse = worseWhen === "up" ? delta > 0 : delta < 0;
  if (!worse) return Math.abs(delta) < 1e-9 ? "OK" : "LOW";
  if (baseline === 0) return "MEDIUM";
  const rel = Math.abs(delta) / Math.max(Math.abs(baseline), 1);
  if (rel >= 0.5) return "CRITICAL";
  if (rel >= 0.25) return "HIGH";
  if (rel >= 0.1) return "MEDIUM";
  return "LOW";
}

export function scaleOrNull(value: number | null, factor: number): number | null {
  if (value === null) return null;
  return roundQty(value * factor);
}

export function applyCapacity(utilization: number | null, capacityChangePct: number): number | null {
  if (utilization === null) return null;
  const factor = factorFromPct(capacityChangePct);
  if (factor <= 0) return 200;
  return Math.min(200, Math.max(0, Math.round(utilization / factor)));
}

export function delayedOrderIds(orders: ScenarioOrderFact[], delayDays: number, now: Date): string[] {
  if (delayDays <= 0) return [];
  return orders
    .filter((order) => {
      const days = daysUntil(order.dueDate, now);
      return days !== null && days >= 0 && days < delayDays;
    })
    .map((order) => order.id);
}

export function deprioritizedOrderIds(
  orders: ScenarioOrderFact[],
  horizon: ForecastHorizonDays,
  priorityMode: PriorityMode,
  now: Date
): string[] {
  if (priorityMode !== "critical") return [];
  return orders
    .filter((order) => {
      if (order.priority === "CRITICAL") return false;
      const days = daysUntil(order.dueDate, now);
      return days !== null && days >= 0 && days <= horizon;
    })
    .map((order) => order.id);
}

export function simulateMaterial(row: ScenarioMaterialFact, demandFactor: number, invFactor: number, procFactor: number) {
  const projected = roundQty(
    row.projectedAvailable +
      row.available * (invFactor - 1) +
      row.incoming * (procFactor - 1) -
      row.grossRequirement * (demandFactor - 1)
  );
  return { projected, shortage: projected < 0 };
}

export function isInventoryConstrained(item: ScenarioInventoryFact, demandFactor: number, invFactor: number): boolean {
  const available = item.available * invFactor;
  const required = item.required * demandFactor;
  if (available <= 0 && (item.available > 0 || item.health === "OUT_OF_STOCK")) return true;
  if (required > 0 && available < required) return true;
  if (item.shortfall > 0 && invFactor < 1) return true;
  if ((item.health === "OUT_OF_STOCK" || item.health === "CRITICAL") && invFactor <= 1) return true;
  return false;
}

export function simulateScenario(
  facts: ScenarioBaselineFacts,
  input: ScenarioInput,
  now = new Date()
): ScenarioSimulation {
  const demandFactor = factorFromPct(input.demandChangePct);
  const invFactor = factorFromPct(input.inventoryAvailabilityChangePct);
  const procFactor = factorFromPct(input.procurementAvailabilityChangePct);

  const delayed = delayedOrderIds(facts.orders, input.productionDelayDays, now);
  const deprioritized = deprioritizedOrderIds(facts.orders, input.horizon, input.priorityMode, now);
  const atRiskIds = new Set([
    ...facts.orders.filter((order) => order.displayStatus === "AT_RISK").map((order) => order.id),
    ...delayed,
    ...deprioritized,
  ]);

  const materialResults = facts.materials.map((row) => ({
    row,
    result: simulateMaterial(row, demandFactor, invFactor, procFactor),
  }));
  const shortages = materialResults.filter((row) => row.result.shortage).length;
  const newlyShortMaterials = materialResults
    .filter((row) => row.result.shortage && !row.row.shortage)
    .map((row) => ({ productId: row.row.productId, name: row.row.name }));

  const constrained = facts.inventoryItems.filter((item) => isInventoryConstrained(item, demandFactor, invFactor)).length;
  const pendingRequisitions = facts.pendingRequisitions + newlyShortMaterials.length;
  const executionNeedsReview = facts.executionNeedsReview + (pendingRequisitions > facts.pendingRequisitions ? 1 : 0);

  return {
    revenue: scaleOrNull(facts.revenueOutlook, demandFactor),
    rfq: scaleOrNull(facts.rfqDemand, demandFactor),
    utilization: applyCapacity(facts.productionUtilization, input.productionCapacityChangePct),
    atRisk: atRiskIds.size,
    delayedOrders: delayed.length,
    deprioritized: deprioritized.length,
    shortages,
    constrained,
    pendingRequisitions,
    executionNeedsReview,
    newlyShortMaterials,
  };
}
