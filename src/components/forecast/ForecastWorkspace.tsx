"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { StructuredAIResponse } from "@/lib/ai/response";
import { FORECAST_HORIZONS, type ForecastSnapshot, type ForecastConfidence } from "@/lib/forecasting/types";
import type { StatusTone } from "@/types/status";

const confidenceTone: Record<ForecastConfidence, StatusTone> = {
  HIGH: "success",
  MEDIUM: "info",
  LOW: "warning",
  INSUFFICIENT: "neutral",
};

const severityTone: Record<string, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

function ForecastChart({ points }: { points: ForecastSnapshot["series"] }) {
  const labelledBy = useId();
  const width = 640;
  const height = 200;
  const pad = { top: 16, right: 16, bottom: 28, left: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const series = useMemo(() => {
    const values = points.map((point) => point.value);
    const max = Math.max(...values, 1);
    const coords = values.map((value, index) => {
      const x = pad.left + (index / Math.max(values.length - 1, 1)) * innerW;
      const y = pad.top + innerH - (value / max) * innerH;
      return { x, y, point: points[index] };
    });
    const historical = coords.filter((row) => row.point.kind === "historical");
    const projected = coords.filter((row) => row.point.kind === "projected");
    const histLine = historical.map((row) => `${row.x},${row.y}`).join(" ");
    const projJoin =
      historical.length > 0 && projected.length > 0
        ? `${historical[historical.length - 1].x},${historical[historical.length - 1].y} ${projected.map((row) => `${row.x},${row.y}`).join(" ")}`
        : projected.map((row) => `${row.x},${row.y}`).join(" ");
    return { coords, histLine, projJoin };
  }, [innerH, innerW, pad.left, pad.top, points]);

  if (points.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">No series available.</p>;
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={labelledBy} className="h-[180px] w-full sm:h-[200px]">
      <title id={labelledBy}>Historical revenue versus projected outlook</title>
      {[0.25, 0.5, 0.75, 1].map((line) => (
        <line
          key={line}
          x1={pad.left}
          x2={width - pad.right}
          y1={pad.top + innerH * (1 - line)}
          y2={pad.top + innerH * (1 - line)}
          className="stroke-border"
          strokeWidth="1"
        />
      ))}
      {series.histLine ? <polyline points={series.histLine} fill="none" className="stroke-primary" strokeWidth="2" /> : null}
      {series.projJoin ? (
        <polyline points={series.projJoin} fill="none" className="stroke-primary" strokeWidth="2" strokeDasharray="5 4" />
      ) : null}
      {series.coords.map((row) => (
        <circle
          key={row.point.label}
          cx={row.x}
          cy={row.y}
          r="3.5"
          className={row.point.kind === "projected" ? "fill-background stroke-primary" : "fill-primary"}
          strokeWidth={row.point.kind === "projected" ? 2 : 0}
        />
      ))}
      {series.coords.map((row) => (
        <text key={`${row.point.label}-l`} x={row.x} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          {row.point.label}
        </text>
      ))}
    </svg>
  );
}

export function ForecastWorkspace({ data }: { data: ForecastSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<StructuredAIResponse | null>(null);

  const setHorizon = (days: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("horizon", String(days));
    router.push(`${pathname}?${params.toString()}`);
  };

  async function explainForecast() {
    setLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: `Explain this forecast for the next ${data.horizon} days.` }),
      });
      const body = (await res.json()) as { response?: StructuredAIResponse; message?: string };
      if (!res.ok || !body.response) {
        setAiError(body.message ?? "AI explanation unavailable");
        return;
      }
      setExplanation(body.response);
    } catch {
      setAiError("AI explanation unavailable");
    } finally {
      setLoading(false);
    }
  }

  const kpis = [data.sales, data.rfq, data.production, data.materials];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Forecast horizon">
          {FORECAST_HORIZONS.map((days) => (
            <Button
              key={days}
              type="button"
              size="xs"
              variant={data.horizon === days ? "secondary" : "ghost"}
              aria-pressed={data.horizon === days}
              className="min-h-9 min-w-11"
              onClick={() => setHorizon(days)}
            >
              {days}D
            </Button>
          ))}
        </div>
        <Button type="button" className="min-h-11 sm:min-h-8" onClick={explainForecast} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
          Explain this forecast
        </Button>
      </div>

      <section className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        {kpis.map((row) => (
          <div key={row.metric} className="min-w-[148px] shrink-0 rounded-lg border border-border/80 bg-background px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">{row.metric}</p>
              <StatusBadge tone={confidenceTone[row.confidence]}>{row.confidence}</StatusBadge>
            </div>
            <p className="mt-1.5 text-sm font-semibold tabular-nums tracking-tight">
              {row.projectedValue ?? "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Recent {row.currentValue} · {row.growth}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border/80 bg-background px-4 py-4 sm:px-5">
        <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Revenue path</h2>
            <p className="text-xs text-muted-foreground">Historical → current → projected. Dashed segment is outlook, not recorded revenue.</p>
          </div>
          <p className="text-[11px] text-muted-foreground">{data.horizonLabel}</p>
        </div>
        {data.sales.confidence === "INSUFFICIENT" ? (
          <EmptyState
            className="border-0 bg-transparent px-0 py-8"
            title="Insufficient historical data"
            description="A revenue outlook is not shown because the recent and prior windows have no realized orders."
          />
        ) : (
          <>
            <ForecastChart points={data.series} />
            <ul className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" aria-hidden />
                Historical
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-px w-4 border-t border-dashed border-primary" aria-hidden />
                Projected
              </li>
            </ul>
          </>
        )}
      </section>

      <section className="rounded-xl border border-border/80 bg-background">
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight">Forecast signals</h2>
        </div>
        {data.signals.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">No directional signals for this horizon.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.signals.map((signal) => (
              <li key={signal} className="px-4 py-3 text-sm sm:px-5">
                {signal}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border/80 bg-background">
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight">Watch next</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Signal → expected impact → date → existing module.</p>
        </div>
        {data.risks.length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent px-4 py-8"
            title="Nothing to watch in this horizon"
            description="Open production, materials, and procurement do not currently project a constraint."
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {data.risks.map((risk) => (
              <li key={risk.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={severityTone[risk.severity] ?? "neutral"}>{risk.severity}</StatusBadge>
                    <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{risk.domain}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium">{risk.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{risk.reason}</p>
                  {risk.projectedDate ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(risk.projectedDate).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </p>
                  ) : null}
                </div>
                <Button asChild size="sm" variant="outline" className="min-h-11 shrink-0 sm:min-h-8">
                  <Link href={risk.actionHref}>
                    View
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.outlook.map((block) => (
          <div key={block.title} className="rounded-xl border border-border/80 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold tracking-tight">{block.title}</h3>
              <StatusBadge tone={confidenceTone[block.metric.confidence]}>{block.metric.confidence}</StatusBadge>
            </div>
            <p className="mt-2 text-sm font-medium tabular-nums">{block.metric.projectedValue ?? "—"}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Recent {block.metric.currentValue} · {block.metric.growth}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {block.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <Button asChild size="sm" variant="ghost" className="mt-2 min-h-9 px-0">
              <Link href={block.href}>Open {block.title.toLowerCase()}</Link>
            </Button>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border/80 px-4 py-4 sm:px-5">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight">AI explanation</h2>
        </div>
        {!explanation && !aiError && !loading && (
          <p className="text-sm text-muted-foreground">
            Forecasts are calculated without AI. Request an explanation when you want the outlook interpreted.
          </p>
        )}
        {loading && <p className="text-sm text-muted-foreground">Generating explanation…</p>}
        {aiError && (
          <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            AI explanation unavailable. The deterministic forecast remains fully usable.
          </div>
        )}
        {explanation && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">{explanation.summary}</p>
            {explanation.keySignals.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {explanation.keySignals.map((signal) => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            )}
            {explanation.recommendedActions.length > 0 && (
              <ul className="space-y-1 text-sm">
                {explanation.recommendedActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">{data.planningNote}</p>
      </section>
    </div>
  );
}
