"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import type { AttentionSeverity } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { ForecastChart } from "@/components/forecast/ForecastChart";
import { confidenceTone } from "@/components/forecast/forecast-display";
import { usePreferences } from "@/components/providers/preferences-provider";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { FORECAST_HORIZONS, type ForecastSnapshot } from "@/lib/forecasting/types";

function riskAttentionSeverity(severity: string): AttentionSeverity {
  if (severity === "CRITICAL" || severity === "HIGH") return severity as AttentionSeverity;
  if (severity === "MEDIUM") return "MEDIUM";
  return "LOW";
}

export function ForecastWorkspaceSimple({ data }: { data: ForecastSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setLayoutMode } = usePreferences();

  const setHorizon = (days: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("horizon", String(days));
    router.push(`${pathname}?${params.toString()}`);
  };

  const kpis = [
    { key: "sales", row: data.sales },
    { key: "rfq", row: data.rfq },
    { key: "production", row: data.production },
    { key: "materials", row: data.materials },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
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
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
          Outlook & AI
        </Button>
      </div>

      <section aria-label="Forecast KPIs" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ row }) => (
          <div key={row.metric} className="work-surface px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{row.metric}</p>
              <StatusBadge tone={confidenceTone[row.confidence]}>{row.confidence}</StatusBadge>
            </div>
            <p className="metric-value mt-1 text-xl tabular-nums">{row.projectedValue ?? "—"}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Recent {row.currentValue} · {row.growth}</p>
          </div>
        ))}
      </section>

      <section className="work-surface px-4 py-4">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Revenue path</h2>
            <p className="text-xs text-muted-foreground">Solid = historical · dashed = projected</p>
          </div>
          <p className="text-[11px] text-muted-foreground">{data.horizonLabel}</p>
        </div>
        {data.sales.confidence === "INSUFFICIENT" ? (
          <EmptyState className="border-0 bg-transparent px-0 py-6" title="Insufficient historical data" description="No revenue outlook for this horizon." />
        ) : (
          <ForecastChart points={data.series} />
        )}
      </section>

      <AttentionList title="Watch next" subtitle={data.risks.length === 0 ? "No projected constraints in this horizon." : "Severity reflects operational exposure if the trend holds."}>
        {data.risks.length === 0 ? (
          <AttentionItem domain="Forecast" severity="INFO" issue="Nothing to watch in this horizon." href="/operations" actionLabel="Operations" />
        ) : (
          data.risks.slice(0, 6).map((risk) => (
            <AttentionItem
              key={risk.id}
              domain={risk.domain}
              severity={riskAttentionSeverity(risk.severity)}
              issue={risk.title}
              evidence={risk.reason}
              href={risk.actionHref}
              actionLabel="View"
            />
          ))
        )}
      </AttentionList>

      {data.signals.length > 0 ? (
        <section aria-label="Forecast signals" className="work-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Directional signals</p>
          </div>
          <ul className="divide-y divide-border text-sm">
            {data.signals.slice(0, 5).map((signal) => (
              <li key={signal} className="px-4 py-3 text-muted-foreground">{signal}</li>
            ))}
          </ul>
        </section>
      ) : null}

    </div>
  );
}
