"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { EmptyState } from "@/components/ds/empty-state";
import { ScenarioJourneyRail } from "@/components/scenarios/ScenarioJourneyRail";
import { chainSeverityTone, presetQuery } from "@/components/scenarios/scenario-display";
import { usePreferences } from "@/components/providers/preferences-provider";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { SCENARIO_PRESETS, type ScenarioSnapshot } from "@/lib/scenarios/types";

export function ScenarioWorkspaceSimple({ data }: { data: ScenarioSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setLayoutMode } = usePreferences();

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="work-surface flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Scenario</p>
          <p className="text-sm font-medium">{data.statusLabel}</p>
          <p className="text-xs text-muted-foreground">{data.horizonLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="warning">Simulation only</StatusBadge>
          <StatusBadge tone="intel">Projected</StatusBadge>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {SCENARIO_PRESETS.slice(0, 3).map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-8"
              onClick={() => router.push(`${pathname}?${presetQuery({ horizon: data.inputs.horizon, ...preset.patch })}`)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
          Assumptions & explain
        </Button>
      </div>

      <section className="work-surface px-4 py-4">
        <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Decision</p>
        <p className="mt-2 text-[15px] font-medium leading-snug">{data.decision.headline}</p>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
          {data.decision.why.slice(0, 3).map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      </section>

      <section className="work-surface">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium">Plan vs scenario</p>
        </div>
        <ul className="divide-y divide-border text-sm">
          {data.comparison.slice(0, 6).map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-xs text-muted-foreground">{row.domain}</p>
                <p className="font-medium">{row.label}</p>
              </div>
              <p className="tabular-nums text-intel">{row.variance}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="work-surface px-4 py-4">
        <p className="text-sm font-medium">Operational journey</p>
        {data.journey.length === 0 ? (
          <EmptyState className="border-0 bg-transparent px-0 py-4" title="No authorized stages" description="Switch to advanced or check permissions." />
        ) : (
          <div className="mt-3">
            <ScenarioJourneyRail data={data} maxItems={6} />
          </div>
        )}
      </section>

      <section className="work-surface">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium">Impact chain</p>
        </div>
        <ol className="divide-y divide-border">
          {data.impactChain.slice(0, 5).map((link, index) => (
            <li key={link.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase">Step {index + 1}</p>
                <p className="text-sm font-medium">{link.trigger}</p>
                <p className="text-xs text-muted-foreground">{link.consequence}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge tone={chainSeverityTone[link.severity] ?? "neutral"}>{link.severity}</StatusBadge>
                <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
                  <Link href={link.href}>View</Link>
                </Button>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap gap-2">
        {data.decision.reviewLinks.slice(0, 4).map((link) => (
          <Button key={link.href} asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
            <Link href={link.href}>{link.label}</Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
