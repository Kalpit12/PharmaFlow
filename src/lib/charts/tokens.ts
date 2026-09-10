import type { ChartTone } from "@/lib/charts/types";

/** Token-based Tailwind classes — no raw hex in chart components. */
export const chartStroke: Record<ChartTone, string> = {
  default: "stroke-chart-1",
  primary: "stroke-chart-1",
  intel: "stroke-chart-2",
  material: "stroke-chart-3",
  warning: "stroke-chart-3",
  danger: "stroke-chart-5",
  neutral: "stroke-chart-6",
};

export const chartFill: Record<ChartTone, string> = {
  default: "fill-chart-1",
  primary: "fill-chart-1",
  intel: "fill-chart-2",
  material: "fill-chart-3",
  warning: "fill-chart-3",
  danger: "fill-chart-5",
  neutral: "fill-chart-6",
};

export const chartBarFill: Record<ChartTone, string> = {
  default: "bg-chart-1",
  primary: "bg-chart-1",
  intel: "bg-chart-2",
  material: "bg-chart-3",
  warning: "bg-chart-3",
  danger: "bg-chart-5",
  neutral: "bg-chart-6",
};

export function utilizationTone(value: number): ChartTone {
  if (value >= 95) return "danger";
  if (value >= 85) return "warning";
  if (value >= 50) return "primary";
  return "neutral";
}
