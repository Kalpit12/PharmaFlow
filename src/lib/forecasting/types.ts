export const FORECAST_HORIZONS = [7, 14, 30] as const;
export type ForecastHorizonDays = (typeof FORECAST_HORIZONS)[number];

export const FORECAST_CONFIDENCE = ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"] as const;
export type ForecastConfidence = (typeof FORECAST_CONFIDENCE)[number];

export type ForecastDirection = "up" | "down" | "stable" | "unknown";

export type ForecastMetric = {
  metric: string;
  currentValue: string;
  projectedValue: string | null;
  direction: ForecastDirection;
  growth: string;
  period: string;
  confidence: ForecastConfidence;
  dataPoints: number;
  explanation: string;
};

export type ForecastSeriesPoint = {
  label: string;
  value: number;
  kind: "historical" | "projected";
};

export type ForecastRisk = {
  id: string;
  domain: "sales" | "demand" | "inventory" | "production" | "materials" | "procurement";
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  projectedDate: string | null;
  reason: string;
  relatedId: string | null;
  actionHref: string;
};

export type ForecastDomainOutlook = {
  title: string;
  href: string;
  metric: ForecastMetric;
  notes: string[];
};

export type ForecastSnapshot = {
  brand: string;
  disclaimer: string;
  generatedAt: string;
  horizon: ForecastHorizonDays;
  horizonLabel: string;
  sales: ForecastMetric;
  rfq: ForecastMetric;
  inventory: ForecastMetric;
  production: ForecastMetric;
  materials: ForecastMetric;
  procurement: ForecastMetric;
  series: ForecastSeriesPoint[];
  signals: string[];
  risks: ForecastRisk[];
  outlook: ForecastDomainOutlook[];
  planningNote: string;
};

type CompactForecastMetric = Pick<
  ForecastMetric,
  "currentValue" | "projectedValue" | "direction" | "growth" | "confidence" | "explanation"
>;

/** Compact packet for explicit AI explanation — no tenant UUID / Prisma. */
export type CompactForecastContext = {
  horizon: string;
  sales: CompactForecastMetric;
  rfq: CompactForecastMetric;
  production: CompactForecastMetric;
  materials: CompactForecastMetric;
  procurement: CompactForecastMetric;
  inventory: CompactForecastMetric;
  risks: Array<{ domain: string; title: string; severity: string; reason: string }>;
};
