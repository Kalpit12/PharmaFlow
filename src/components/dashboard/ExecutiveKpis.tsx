import { MetricStrip } from "@/components/ds/metric-strip";
import type { DashboardMetric } from "@/lib/mock/dashboard";

export function ExecutiveKpis({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <MetricStrip
      aria-label="Executive metrics"
      items={metrics.map((metric) => ({
        id: metric.id,
        label: metric.label,
        value: metric.value,
        hint: `${metric.trend} · ${metric.period}`,
        tone: metric.trendUp ? "success" : "danger",
      }))}
    />
  );
}
