export type ChartTone = "default" | "primary" | "intel" | "material" | "warning" | "danger" | "neutral";

export type ChartBarRow = {
  id: string;
  label: string;
  value: number;
  hint?: string;
  href?: string;
  tone?: ChartTone;
};

export type ChartSeriesPoint = {
  label: string;
  primary: number;
  secondary?: number;
};

export type GroupedBarRow = {
  id: string;
  label: string;
  primary: number;
  secondary: number | null;
  href?: string;
};

export type StackedSegment = {
  id: string;
  label: string;
  value: number;
  tone: ChartTone;
  href?: string;
};

export type FunnelStage = {
  id: string;
  label: string;
  count: number;
  href?: string;
};
