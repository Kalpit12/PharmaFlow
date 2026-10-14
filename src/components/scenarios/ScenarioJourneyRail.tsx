"use client";

import Link from "next/link";

import { stageSeverityTone } from "@/components/scenarios/scenario-display";
import { StatusBadge } from "@/components/ds/status-badge";
import type { ScenarioSnapshot } from "@/lib/scenarios/types";
import { cn } from "@/lib/utils";

export function ScenarioJourneyRail({ data, maxItems }: { data: ScenarioSnapshot; maxItems?: number }) {
  const stages = maxItems != null ? data.journey.slice(0, maxItems) : data.journey;

  return (
    <ol className="relative space-y-0" aria-label="Operational journey">
      {stages.map((stage, index) => (
        <li key={stage.id} className="relative flex gap-3 pb-5 last:pb-0">
          {index < stages.length - 1 ? (
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
              <StatusBadge tone={stageSeverityTone[stage.status] ?? "neutral"}>{stage.status}</StatusBadge>
            </div>
            <p className="mt-1 text-sm font-medium tracking-tight">{stage.metric}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{stage.reason}</p>
            <Link href={stage.href} className="mt-2 inline-flex text-[11px] text-primary">
              Inspect workspace
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}
