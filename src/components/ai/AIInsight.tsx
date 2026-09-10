import { StatusBadge } from "@/components/ds/status-badge";
import type { AIInsight } from "@/lib/mock/ai";

export function AIInsight({ insight }: { insight: AIInsight }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-muted/70 px-3 py-2">
      <p className="text-[11px] leading-snug text-muted-foreground break-words">{insight.label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums break-words">{insight.value}</p>
      {insight.delta ? (
        <p className={insight.positive === false ? "text-xs font-medium tabular-nums text-danger" : "text-xs font-medium tabular-nums text-success"}>
          {insight.delta}
        </p>
      ) : null}
    </div>
  );
}

export function AIInsightRow({ insights }: { insights: AIInsight[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {insights.map((insight) => (
        <AIInsight key={`${insight.label}-${insight.value}`} insight={insight} />
      ))}
    </div>
  );
}

export function AISparkline({ values, label }: { values: number[]; label: string }) {
  const width = 220;
  const height = 48;
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - 4 - (value / max) * (height - 8);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <figure className="mt-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full max-w-[220px]" role="img" aria-label={label}>
        <polyline points={points} fill="none" stroke="currentColor" className="text-primary" strokeWidth="2" />
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

export function AIMarker() {
  return <StatusBadge tone="primary">Pharmaflow AI</StatusBadge>;
}
