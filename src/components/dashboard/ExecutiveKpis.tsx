"use client";

import { MetricStrip } from "@/components/ds/metric-strip";
import { useLayoutMode } from "@/components/providers/preferences-provider";
import type { DashboardMetric } from "@/lib/mock/dashboard";

const SIMPLE_METRIC_IDS = new Set(["revenue", "orders", "rfqs", "customers"]);

export function ExecutiveKpis({ metrics }: { metrics: DashboardMetric[] }) {
  const { simple } = useLayoutMode();
  const visible = simple ? metrics.filter((metric) => SIMPLE_METRIC_IDS.has(metric.id)) : metrics;

  return (
    <MetricStrip
      aria-label="Executive metrics"
      items={visible.map((metric) => ({
        id: metric.id,
        label: metric.label,
        value: metric.value,
        hint: simple ? metric.trend : `${metric.trend} · ${metric.period}`,
        tone: metric.trendUp ? "success" : "danger",
        href:
          metric.id === "rfqs"
            ? "/rfqs"
            : metric.id === "orders"
              ? "/reports?view=sales"
              : metric.id === "customers"
                ? "/reports?view=customers"
                : undefined,
      }))}
    />
  );
}
