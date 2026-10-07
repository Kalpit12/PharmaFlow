"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
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
  type ScenarioExplanation,
  type ScenarioInput,
  type ScenarioSnapshot,
} from "@/lib/scenarios/types";
import type { StatusTone } from "@/types/status";
import { cn } from "@/lib/utils";

const severityTone: Record<string, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "material",
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
      <p className="mb-1.5 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
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

function JourneyRail({ data }: { data: ScenarioSnapshot }) {
  return (
    <ol className="relative space-y-0" aria-label="Operational journey">
      {data.journey.map((stage, index) => (
        <li key={stage.id} className="relative flex gap-3 pb-5 last:pb-0">
          {index < data.journey.length - 1 ? (
            <span className="absolute top-3 left-[7px] h-[calc(100%-4px)] w-px bg-border/80" aria-hidden />
          ) : null}
          <span
            className={cn(
              "relative z-10 mt-0.5 size-3.5 shrink-0 rounded-full ring-2 ring-background",
              stage.status === "CRITICAL" || stage.status === "HIGH"
                ? "bg-destructive"
                : stage.status === "MEDIUM"
                  ? "bg-intel"
                  : "bg-muted-foreground/40"
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{stage.label}</p>
              <StatusBadge tone={severityTone[stage.status] ?? "neutral"}>{stage.status}</StatusBadge>
              <span className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">{stage.confidence.replace(/_/g, " ")}</span>
            </div>
            <p className="mt-1 text-sm font-medium tracking-tight">{stage.metric}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{stage.reason}</p>
            <p className="mt-1 text-[11px] tabular-nums text-foreground/75">
              Current {stage.baseline} · Scenario {stage.projected} · {stage.delta}
            </p>
            <Link href={stage.href} className="mt-2 inline-flex text-[11px] text-primary">
              Inspect workspace
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ScenarioWorkspace({ data }: { data: ScenarioSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState<ScenarioInput>(data.inputs);
  const [pendingId, setPendingId] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<ScenarioExplanation | null>(null);
  const appliedKey = encodeScenarioInput(data.inputs);
  const stamp = new Date(data.generatedAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });

  useEffect(() => {
    setDraft(data.inputs);
  }, [appliedKey, data.inputs]);

  const dirty = encodeScenarioInput(draft) !== appliedKey;
  const identity = isIdentityScenario(data.inputs);

  const queryParams = useMemo(() => toQuery(data.inputs), [data.inputs]);

  function runScenario() {
    router.push(`${pathname}?${toQuery(draft)}`);
  }

  function resetScenario() {
    setDraft(DEFAULT_SCENARIO_INPUT);
    setExplanation(null);
    router.push(pathname);
  }

  async function explainScenario() {
    setError(null);
    setPendingId(true);
    try {
      const res = await fetch("/api/scenarios/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Explain this scenario.", params: Object.fromEntries(new URLSearchParams(queryParams)) }),
      });
      const body = (await res.json()) as { explanation?: ScenarioExplanation; message?: string };
      if (!res.ok || !body.explanation) {
        setError(body.message ?? "Explanation unavailable.");
        return;
      }
      setExplanation(body.explanation);
    } catch {
      setError("Explanation unavailable.");
    } finally {
      setPendingId(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="work-surface flex flex-wrap items-end justify-between gap-3 px-4 py-3 sm:px-5">
        <div>
          <p className="label-context">Scenario status</p>
          <p className="mt-1 text-sm font-medium tracking-tight">{data.statusLabel}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.horizonLabel} · Calculated {stamp} UTC · {data.openaiCallsOnLoad} AI calls on load
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="warning">Simulation only</StatusBadge>
          <StatusBadge tone="intel">Projected</StatusBadge>
        </div>
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-12 xl:items-start">
        <aside className="work-surface min-w-0 xl:col-span-3">
          <div className="border-b border-border/70 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-medium tracking-tight">Assumptions</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Adjust, then run. Live operational data is never mutated.</p>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <div className="flex flex-wrap gap-1.5">
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
              <ChoiceGroup label="Horizon" value={draft.horizon} options={SCENARIO_HORIZONS} format={(days) => `${days}D`} onChange={(horizon) => setDraft({ ...draft, horizon })} />
              <ChoiceGroup label="Demand" value={draft.demandChangePct} options={DEMAND_PCTS} format={pctLabel} onChange={(demandChangePct) => setDraft({ ...draft, demandChangePct })} />
              <ChoiceGroup label="Capacity" value={draft.productionCapacityChangePct} options={CAPACITY_PCTS} format={pctLabel} onChange={(productionCapacityChangePct) => setDraft({ ...draft, productionCapacityChangePct })} />
              <ChoiceGroup label="Production delay" value={draft.productionDelayDays} options={DELAY_DAYS} format={(days) => `${days}d`} onChange={(productionDelayDays) => setDraft({ ...draft, productionDelayDays })} />
              <ChoiceGroup label="Inventory" value={draft.inventoryAvailabilityChangePct} options={INVENTORY_PCTS} format={pctLabel} onChange={(inventoryAvailabilityChangePct) => setDraft({ ...draft, inventoryAvailabilityChangePct })} />
              <ChoiceGroup label="Inbound cover" value={draft.procurementAvailabilityChangePct} options={PROCUREMENT_PCTS} format={pctLabel} onChange={(procurementAvailabilityChangePct) => setDraft({ ...draft, procurementAvailabilityChangePct })} />
              <ChoiceGroup label="Priority" value={draft.priorityMode} options={["current", "critical"] as const} format={(mode) => (mode === "current" ? "Current" : "Critical")} onChange={(priorityMode) => setDraft({ ...draft, priorityMode })} />
            </div>
            <div className="mt-4 overflow-x-auto border-t border-border/70 pt-3">
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Applied assumptions</p>
              <table className="mt-2 w-full min-w-[16rem] text-xs" aria-label="Applied scenario assumptions">
                <thead>
                  <tr className="text-left text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    <th className="py-1 pr-2 font-medium">Variable</th>
                    <th className="py-1 pr-2 font-medium">Current</th>
                    <th className="py-1 pr-2 font-medium">Scenario</th>
                    <th className="py-1 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assumptions.map((row) => (
                    <tr key={row.id} className="border-t border-border/40">
                      <td className="py-1.5 pr-2 font-medium">{row.label}</td>
                      <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{row.current}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{row.supported ? row.scenario : "Not recorded"}</td>
                      <td className="py-1.5 tabular-nums text-muted-foreground">{row.change}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button type="button" className="min-h-11 flex-1 sm:min-h-8" onClick={runScenario} disabled={!dirty}>
                Run scenario
              </Button>
              <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" onClick={resetScenario}>
                Reset
              </Button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-5 xl:col-span-6">
          <section className="work-surface">
            <div className="border-b border-border/70 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-medium tracking-tight">Current plan vs scenario</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {identity ? "Baseline matches current reality." : "Variance columns are projected — not recorded facts."}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    <th className="px-4 py-2 sm:px-5">Domain</th>
                    <th className="px-4 py-2">Metric</th>
                    <th className="px-4 py-2">Current</th>
                    <th className="px-4 py-2">Scenario</th>
                    <th className="px-4 py-2 sm:pr-5">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.comparison.map((row) => (
                    <tr key={row.id} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-3 text-xs text-muted-foreground sm:px-5">{row.domain}</td>
                      <td className="px-4 py-3 font-medium">{row.label}</td>
                      <td className="px-4 py-3 tabular-nums">{row.current}</td>
                      <td className="px-4 py-3 tabular-nums text-intel">{row.scenario}</td>
                      <td className="px-4 py-3 tabular-nums sm:pr-5">{row.variance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="work-surface">
            <div className="border-b border-border/70 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-medium tracking-tight">Operational journey</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Dependency map from demand through customer exposure.</p>
            </div>
            <div className="px-4 py-4 sm:px-5">
              {data.journey.length === 0 ? (
                <EmptyState className="border-0 bg-transparent px-0 py-6" title="No authorized journey stages" description={`Excluded domains: ${data.excludedDomains.join(", ") || "none"}.`} />
              ) : (
                <JourneyRail data={data} />
              )}
            </div>
          </section>

          <section className="work-surface">
            <div className="border-b border-border/70 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-medium tracking-tight">Impact chain</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">How scenario assumptions propagate across domains.</p>
            </div>
            <ol className="divide-y divide-border/60">
              {data.impactChain.map((link, index) => (
                <li key={link.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Step {index + 1}</p>
                    <p className="mt-1 text-sm font-medium">{link.trigger}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{link.consequence}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge tone={severityTone[link.severity] ?? "neutral"}>{link.severity}</StatusBadge>
                    <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
                      <Link href={link.href}>View</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="work-surface min-w-0 xl:col-span-3">
          <div className="border-b border-border/70 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-medium tracking-tight">Decision context</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Human decision required. No execute action exists.</p>
          </div>
          <div className="space-y-4 px-4 py-4 sm:px-5">
            <div>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Outcome</p>
              <p className="mt-2 text-[15px] font-medium leading-snug tracking-tight">{data.decision.headline}</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Why</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {data.decision.why.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Trade-offs</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {data.decision.tradeOffs.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Data limitations</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {data.decision.limitations.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              {data.decision.reviewLinks.map((link) => (
                <Button key={link.href} asChild size="sm" variant="outline" className="min-h-11 justify-start sm:min-h-8">
                  <Link href={link.href}>{link.label}</Link>
                </Button>
              ))}
              <Button type="button" size="sm" className="min-h-11 sm:min-h-8" onClick={explainScenario} disabled={pendingId} aria-label="Explain scenario">
                {pendingId ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
                Explain
              </Button>
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {explanation ? (
              <div className="border-t border-border/70 pt-4 text-sm" data-scenario-explanation>
                <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  {explanation.source === "openai" ? "AI explanation" : "Deterministic explanation"}
                </p>
                <p className="mt-2 font-medium leading-relaxed">{explanation.summary}</p>
                {explanation.keyDrivers.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-4 text-muted-foreground">
                    {explanation.keyDrivers.map((row) => (
                      <li key={row}>{row}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <p className="text-[11px] text-muted-foreground">{data.planningNote}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
