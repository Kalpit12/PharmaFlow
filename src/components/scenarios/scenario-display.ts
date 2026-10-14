import { DEFAULT_SCENARIO_INPUT, type ScenarioInput } from "@/lib/scenarios/types";
import type { StatusTone } from "@/types/status";

export const stageSeverityTone: Record<string, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "material",
  LOW: "neutral",
  OK: "success",
};

export const chainSeverityTone: Record<string, StatusTone> = stageSeverityTone;

export function scenarioToQuery(input: ScenarioInput): string {
  const params = new URLSearchParams({
    horizon: String(input.horizon),
    demand: String(input.demandChangePct),
    capacity: String(input.productionCapacityChangePct),
    delay: String(input.productionDelayDays),
    inventory: String(input.inventoryAvailabilityChangePct),
    procurement: String(input.procurementAvailabilityChangePct),
    priority: input.priorityMode,
  });
  return params.toString();
}

export function presetQuery(patch: Partial<ScenarioInput>): string {
  return scenarioToQuery({ ...DEFAULT_SCENARIO_INPUT, ...patch });
}
