import type { ForecastConfidence, ForecastHorizonDays } from "@/lib/forecasting/types";

export const SCENARIO_HORIZONS = [7, 14, 30] as const;
export const DEMAND_PCTS = [-20, -10, 0, 10, 20] as const;
export const CAPACITY_PCTS = [-20, -10, 0, 10, 20] as const;
export const DELAY_DAYS = [0, 1, 3, 7] as const;
export const INVENTORY_PCTS = [-20, -10, 0, 10] as const;
export const PROCUREMENT_PCTS = [-20, 0, 20] as const;
export const PRIORITY_MODES = ["current", "critical"] as const;

export type DemandChangePct = (typeof DEMAND_PCTS)[number];
export type CapacityChangePct = (typeof CAPACITY_PCTS)[number];
export type DelayDays = (typeof DELAY_DAYS)[number];
export type InventoryChangePct = (typeof INVENTORY_PCTS)[number];
export type ProcurementChangePct = (typeof PROCUREMENT_PCTS)[number];
export type PriorityMode = (typeof PRIORITY_MODES)[number];
export type ScenarioSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OK";
export type ScenarioDomain =
  | "sales"
  | "demand"
  | "inventory"
  | "production"
  | "materials"
  | "procurement"
  | "execution";

export type ScenarioInput = {
  horizon: ForecastHorizonDays;
  demandChangePct: DemandChangePct;
  productionCapacityChangePct: CapacityChangePct;
  productionDelayDays: DelayDays;
  inventoryAvailabilityChangePct: InventoryChangePct;
  procurementAvailabilityChangePct: ProcurementChangePct;
  priorityMode: PriorityMode;
};

export const DEFAULT_SCENARIO_INPUT: ScenarioInput = {
  horizon: 30,
  demandChangePct: 0,
  productionCapacityChangePct: 0,
  productionDelayDays: 0,
  inventoryAvailabilityChangePct: 0,
  procurementAvailabilityChangePct: 0,
  priorityMode: "current",
};

export type ScenarioPreset = {
  id: string;
  label: string;
  patch: Partial<ScenarioInput>;
};

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  { id: "demand-surge", label: "Demand Surge", patch: { demandChangePct: 20 } },
  { id: "production-delay", label: "Production Delay", patch: { productionDelayDays: 3 } },
  { id: "capacity-constraint", label: "Capacity Constraint", patch: { productionCapacityChangePct: -20 } },
  { id: "supply-constraint", label: "Supply Constraint", patch: { procurementAvailabilityChangePct: -20 } },
  { id: "critical-priority", label: "Critical Priority", patch: { priorityMode: "critical" } },
];

export type ScenarioOrderFact = {
  id: string;
  productName: string;
  dueDate: string;
  priority: string;
  displayStatus: string;
};

export type ScenarioMaterialFact = {
  productId: string;
  name: string;
  available: number;
  incoming: number;
  grossRequirement: number;
  projectedAvailable: number;
  shortage: boolean;
  risk: string;
  earliestDueDate: string | null;
  affectedOrderCount: number;
};

export type ScenarioInventoryFact = {
  id: string;
  name: string;
  available: number;
  required: number;
  shortfall: number;
  health: string;
};

export type ScenarioBaselineFacts = {
  revenueOutlook: number | null;
  revenueConfidence: ForecastConfidence;
  rfqDemand: number | null;
  rfqConfidence: ForecastConfidence;
  productionUtilization: number | null;
  dueInHorizon: number;
  atRisk: number;
  unscheduled: number;
  orders: ScenarioOrderFact[];
  materials: ScenarioMaterialFact[];
  inventoryItems: ScenarioInventoryFact[];
  pendingRequisitions: number;
  executionNeedsReview: number;
  hasOperations: boolean;
  hasMaterials: boolean;
  hasInventory: boolean;
  hasProcurement: boolean;
  hasExecution: boolean;
};

export type ScenarioSimulation = {
  revenue: number | null;
  rfq: number | null;
  utilization: number | null;
  atRisk: number;
  delayedOrders: number;
  deprioritized: number;
  shortages: number;
  constrained: number;
  pendingRequisitions: number;
  executionNeedsReview: number;
  newlyShortMaterials: Array<{ productId: string; name: string }>;
};

export type ScenarioImpact = {
  id: string;
  domain: ScenarioDomain;
  metric: string;
  baseline: string;
  projected: string | null;
  delta: string;
  direction: "up" | "down" | "stable" | "unknown";
  severity: ScenarioSeverity;
  explanation: string;
  href: string;
};

export type ScenarioRisk = {
  id: string;
  domain: ScenarioDomain;
  title: string;
  severity: ScenarioSeverity;
  baseline: string;
  scenario: string;
  impact: string;
  href: string;
};

export type ScenarioChartPoint = {
  label: string;
  baseline: number;
  scenario: number;
};

export type ScenarioSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  horizon: ForecastHorizonDays;
  horizonLabel: string;
  inputs: ScenarioInput;
  simulationOnly: true;
  baseline: {
    revenue: string;
    demand: string;
    production: string;
    shortages: string;
    procurement: string;
  };
  scenario: {
    revenue: string | null;
    demand: string | null;
    production: string | null;
    shortages: string | null;
    procurement: string | null;
  };
  impacts: ScenarioImpact[];
  risks: ScenarioRisk[];
  recommendations: string[];
  dataConfidence: ForecastConfidence;
  series: ScenarioChartPoint[];
  planningNote: string;
};

export type CompactScenarioContext = {
  simulation: "SIMULATED";
  horizon: string;
  inputs: ScenarioInput;
  impacts: Array<{
    domain: string;
    metric: string;
    baseline: string;
    projected: string | null;
    delta: string;
    severity: string;
  }>;
  risks: Array<{ title: string; severity: string; impact: string }>;
};
