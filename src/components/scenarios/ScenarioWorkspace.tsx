"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { StructuredAIResponse } from "@/lib/ai/response";
import { encodeScenarioInput, isIdentityScenario } from "@/lib/scenarios/engine";
import {
  CAPACITY_PCTS,
  DELAY_DAYS,
  DEFAULT_SCENARIO_INPUT,
  DEMAND_PCTS,
  INVENTORY_PCTS,
  PROCUREMENT_PCTS,
  SCENARIO_HORIZONS,
  SCENARIO_PRESETS,
  type ScenarioInput,
  type ScenarioSnapshot,
} from "@/lib/scenarios/types";
import type { StatusTone } from "@/types/status";

const severityTone: Record<string, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
  OK: "success",
};

function pctLabel(value: number): string {
  return `${value > 0 ? "+" : ""}${value}%`;
}

function toQuery(input: ScenarioInput): string {
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

function ScenarioChart({ points }: { points: ScenarioSnapshot["series"] }) {
  const labelledBy = useId();
  const width = 640;
  const height = 200;
  const pad = { top: 16, right: 12, bottom: 28, left: 12 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(...points.flatMap((point) => [point.baseline, point.scenario]), 1);
  const groupW = innerW / Math.max(points.length, 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={labelledBy} className="h-[180px] w-full sm:h-[200px]">
      <title id={labelledBy}>Baseline versus simulated scenario</title>
      {points.map((point, index) => {
        const x = pad.left + index * groupW + groupW * 0.18;
        const barW = groupW * 0.26;
        const baseH = (point.baseline / max) * innerH;
        const scenH = (point.scenario / max) * innerH;
        return (
          <g key={point.label}>
            <rect x={x} y={pad.top + innerH - baseH} width={barW} height={baseH} className="fill-primary" rx="2" />
            <rect
              x={x + barW + 6}
              y={pad.top + innerH - scenH}
              width={barW}
              height={scenH}
              className="fill-primary/35 stroke-primary"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              rx="2"
            />
            <text x={x + barW + 3} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ChoiceGroup<T extends string | number>({
  label,
  value,
  options,
  format,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  format?: (option: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {options.map((option) => (
          <Button
            key={String(option)}
            type="button"
            size="xs"
            variant={value === option ? "secondary" : "ghost"}
            aria-pressed={value === option}
            className="min-h-11 min-w-11 sm:min-h-8"
            onClick={() => onChange(option)}
          >
            {format ? format(option) : String(option)}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ScenarioWorkspace({ data }: { data: ScenarioSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState<ScenarioInput>(data.inputs);
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<StructuredAIResponse | null>(null);
  const appliedKey = encodeScenarioInput(data.inputs);

  useEffect(() => {
    setDraft(data.inputs);
  }, [appliedKey, data.inputs]);

  const dirty = encodeScenarioInput(draft) !== appliedKey;
  const identity = isIdentityScenario(data.inputs);

  const kpis = useMemo(
    () => [
      { label: "Revenue outlook", baseline: data.baseline.revenue, scenario: data.scenario.revenue },
      { label: "Demand", baseline: data.baseline.demand, scenario: data.scenario.demand },
      { label: "Production pressure", baseline: data.baseline.production, scenario: data.scenario.production },
      { label: "Material shortages", baseline: data.baseline.shortages, scenario: data.scenario.shortages },
      { label: "Procurement attention", baseline: data.baseline.procurement, scenario: data.scenario.procurement },
    ],
    [data]
  );

  function runScenario() {
    router.push(`${pathname}?${toQuery(draft)}`);
  }

  function resetScenario() {
    setDraft(DEFAULT_SCENARIO_INPUT);
    setExplanation(null);
    router.push(pathname);
  }

  async function explainScenario() {
    setLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `Explain this scenario. horizon=${data.inputs.horizon} demand=${data.inputs.demandChangePct} capacity=${data.inputs.productionCapacityChangePct} delay=${data.inputs.productionDelayDays} inventory=${data.inputs.inventoryAvailabilityChangePct} procurement=${data.inputs.procurementAvailabilityChangePct} priority=${data.inputs.priorityMode}`,
        }),
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

  return (
    <div className="flex min-w-0 flex-col gap-6 lg:grid lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside className="min-w-0 rounded-xl border border-border/80 bg-background p-4">
        <p className="text-sm font-semibold tracking-tight">Assumptions</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Populate, then run. Nothing is written to the business.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SCENARIO_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="xs"
              variant="outline"
              className="min-h-11 sm:min-h-8"
              onClick={() => setDraft({ ...DEFAULT_SCENARIO_INPUT, horizon: draft.horizon, ...preset.patch })}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <ChoiceGroup
            label="Horizon"
            value={draft.horizon}
            options={SCENARIO_HORIZONS}
            format={(days) => `${days}D`}
            onChange={(horizon) => setDraft({ ...draft, horizon })}
          />
          <ChoiceGroup
            label="Demand"
            value={draft.demandChangePct}
            options={DEMAND_PCTS}
            format={pctLabel}
            onChange={(demandChangePct) => setDraft({ ...draft, demandChangePct })}
          />
          <ChoiceGroup
            label="Production capacity"
            value={draft.productionCapacityChangePct}
            options={CAPACITY_PCTS}
            format={pctLabel}
            onChange={(productionCapacityChangePct) => setDraft({ ...draft, productionCapacityChangePct })}
          />
          <ChoiceGroup
            label="Production delay"
            value={draft.productionDelayDays}
            options={DELAY_DAYS}
            format={(days) => `${days}d`}
            onChange={(productionDelayDays) => setDraft({ ...draft, productionDelayDays })}
          />
          <ChoiceGroup
            label="Inventory availability"
            value={draft.inventoryAvailabilityChangePct}
            options={INVENTORY_PCTS}
            format={pctLabel}
            onChange={(inventoryAvailabilityChangePct) => setDraft({ ...draft, inventoryAvailabilityChangePct })}
          />
          <ChoiceGroup
            label="Procurement availability"
            value={draft.procurementAvailabilityChangePct}
            options={PROCUREMENT_PCTS}
            format={pctLabel}
            onChange={(procurementAvailabilityChangePct) => setDraft({ ...draft, procurementAvailabilityChangePct })}
          />
          <ChoiceGroup
            label="Priority mode"
            value={draft.priorityMode}
            options={["current", "critical"] as const}
            format={(mode) => (mode === "current" ? "Current" : "Critical")}
            onChange={(priorityMode) => setDraft({ ...draft, priorityMode })}
          />
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="min-h-11 flex-1 sm:min-h-8" onClick={runScenario} disabled={!dirty}>
            Run scenario
          </Button>
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" onClick={resetScenario}>
            Reset
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Current</span>
            <span className="text-sm font-medium">Reality</span>
            <span className="text-muted-foreground" aria-hidden>
              vs
            </span>
            <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Scenario</span>
            <span className="text-sm font-medium">Simulated</span>
            <StatusBadge tone="warning">Simulation only</StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground">
            {identity ? "No assumption changes — scenario matches current reality." : data.horizonLabel}
          </p>
        </section>

        <section className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {kpis.map((row) => (
            <div key={row.label} className="min-w-[156px] shrink-0 rounded-lg border border-border/80 bg-background px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">{row.label}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Current {row.baseline}</p>
              <p className="text-sm font-semibold tabular-nums tracking-tight">{row.scenario ?? "—"}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-border/80 bg-background px-4 py-4 sm:px-5">
          <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Baseline vs scenario</h2>
              <p className="text-xs text-muted-foreground">Solid bars are current. Dashed bars are simulated.</p>
            </div>
          </div>
          <ScenarioChart points={data.series} />
        </section>

        <section className="rounded-xl border border-border/80 bg-background">
          <div className="border-b border-border/70 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold tracking-tight">Impact</h2>
          </div>
          <ul className="hidden divide-y divide-border/60 md:block">
            <li className="grid grid-cols-[1fr_1.2fr_1fr_1fr_1fr_5.5rem] gap-2 px-5 py-2 text-[11px] tracking-wide text-muted-foreground uppercase">
              <span>Domain</span>
              <span>Metric</span>
              <span>Current</span>
              <span>Scenario</span>
              <span>Change</span>
              <span>Risk</span>
            </li>
            {data.impacts.map((row) => (
              <li key={row.id} className="grid grid-cols-[1fr_1.2fr_1fr_1fr_1fr_5.5rem] items-center gap-2 px-5 py-3 text-sm">
                <span className="capitalize text-muted-foreground">{row.domain}</span>
                <span className="font-medium">{row.metric}</span>
                <span className="tabular-nums">{row.baseline}</span>
                <span className="tabular-nums">{row.projected ?? "—"}</span>
                <span className="tabular-nums">{row.delta}</span>
                <StatusBadge tone={severityTone[row.severity] ?? "neutral"}>{row.severity}</StatusBadge>
              </li>
            ))}
          </ul>
          <ul className="divide-y divide-border/60 md:hidden">
            {data.impacts.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{row.metric}</p>
                  <StatusBadge tone={severityTone[row.severity] ?? "neutral"}>{row.severity}</StatusBadge>
                </div>
                <p className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">{row.domain}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Current {row.baseline} → Scenario {row.projected ?? "—"} · {row.delta}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border/80 bg-background">
          <div className="border-b border-border/70 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold tracking-tight">What changes?</h2>
          </div>
          {data.risks.length === 0 ? (
            <EmptyState
              className="border-0 bg-transparent px-4 py-8"
              title="No material change under these assumptions"
              description="Adjust demand, capacity, delay, or supply, then run the scenario."
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
                    <p className="mt-1 text-sm text-muted-foreground">{risk.impact}</p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="min-h-11 shrink-0 sm:min-h-8">
                    <Link href={risk.href}>
                      View
                      <ArrowRight data-icon="inline-end" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border/80 bg-background">
          <div className="border-b border-border/70 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold tracking-tight">Management attention</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Signal → impact → existing module. No actions are created.</p>
          </div>
          {data.risks.filter((row) => row.severity === "CRITICAL" || row.severity === "HIGH" || row.severity === "MEDIUM").length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">Nothing elevated to watch under this simulation.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.risks
                .filter((row) => row.severity === "CRITICAL" || row.severity === "HIGH" || row.severity === "MEDIUM")
                .slice(0, 5)
                .map((risk) => (
                  <li key={`attn-${risk.id}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div>
                      <p className="text-sm font-medium">{risk.title}</p>
                      <p className="text-xs text-muted-foreground">{risk.impact}</p>
                    </div>
                    <Button asChild size="sm" variant="ghost" className="min-h-11 justify-start px-0 sm:min-h-8">
                      <Link href={risk.href}>Open module</Link>
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </section>

        {data.recommendations.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {data.recommendations.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        ) : null}

        <section className="rounded-xl border border-border/80 px-4 py-4 sm:px-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" aria-hidden />
              <h2 className="text-sm font-semibold tracking-tight">AI explanation</h2>
            </div>
            <Button type="button" className="min-h-11 sm:min-h-8" onClick={explainScenario} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
              Explain this scenario
            </Button>
          </div>
          {!explanation && !aiError && !loading && (
            <p className="text-sm text-muted-foreground">
              Scenarios are calculated without AI. Request an explanation when you want the impact interpreted.
            </p>
          )}
          {loading && <p className="text-sm text-muted-foreground">Generating explanation…</p>}
          {aiError && (
            <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              AI explanation unavailable. The deterministic simulation remains fully usable.
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
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">{data.planningNote}</p>
        </section>
      </div>
    </div>
  );
}
