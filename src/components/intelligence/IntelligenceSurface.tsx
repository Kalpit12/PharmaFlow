"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { confidenceLabel } from "@/lib/intelligence/facts";
import type { IntelligenceExplanation, IntelligenceSnapshot, OperationalPriority } from "@/lib/intelligence/types";
import { cn } from "@/lib/utils";

function severityTone(band: OperationalPriority["band"]): "danger" | "warning" | "material" | "neutral" {
  if (band === "CRITICAL") return "danger";
  if (band === "HIGH") return "warning";
  if (band === "MEDIUM") return "material";
  return "neutral";
}

function ExplanationBlock({ explanation }: { explanation: IntelligenceExplanation }) {
  return (
    <div className="border-t border-border/70 px-4 py-4 text-sm sm:px-5" data-intelligence-explanation>
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {explanation.source === "openai" ? "AI explanation" : "Deterministic explanation"}
      </p>
      <p className="mt-2 font-medium leading-relaxed">{explanation.summary}</p>
      {explanation.reasons.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-muted-foreground">
          {explanation.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {explanation.impacts.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Impact</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
            {explanation.impacts.map((impact) => (
              <li key={impact}>{impact}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {explanation.reviewItems.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">What to review</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
            {explanation.reviewItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {explanation.limitations.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{explanation.limitations.join(" ")}</p>
      ) : null}
    </div>
  );
}

export function IntelligenceSurface({
  data,
  title = "Operational Intelligence",
  subtitle = "Deterministic priorities from production, materials, quality, and supply. Explain is optional.",
  grouped = false,
}: {
  data: IntelligenceSnapshot;
  title?: string;
  subtitle?: string;
  grouped?: boolean;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<IntelligenceExplanation | null>(null);

  async function explain(priority?: OperationalPriority) {
    setError(null);
    setPendingId(priority?.id ?? "all");
    try {
      const res = await fetch("/api/intelligence/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: priority ? `Why is this at risk? ${priority.title}` : "What should management look at?",
          priorityId: priority?.id,
        }),
      });
      const body = (await res.json()) as { explanation?: IntelligenceExplanation; message?: string };
      if (!res.ok || !body.explanation) {
        setError(body.message ?? "Explanation unavailable.");
        return;
      }
      setExplanation(body.explanation);
    } catch {
      setError("Explanation unavailable.");
    } finally {
      setPendingId(null);
    }
  }

  const sections = grouped
    ? [
        { id: "critical", label: "Critical", rows: data.bands.critical },
        { id: "high", label: "High", rows: data.bands.high },
        { id: "watch", label: "Watch", rows: data.bands.watch },
      ]
    : [{ id: "all", label: null, rows: data.priorities.slice(0, 8) }];

  return (
    <section className="work-surface" aria-label="Operational intelligence">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-medium tracking-tight">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 sm:min-h-8"
          onClick={() => explain()}
          disabled={pendingId !== null}
          aria-label="Explain operational priorities"
        >
          {pendingId === "all" ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
          Explain
        </Button>
      </div>

      {data.priorities.length === 0 ? (
        <EmptyState
          className="border-0 px-4 py-10"
          title="No operational priorities"
          description={
            data.excludedDomains.length
              ? `Authorized domains have no ranked exceptions. Excluded: ${data.excludedDomains.join(", ")}.`
              : "Recorded facts do not currently rank a management exception."
          }
        />
      ) : (
        <div>
          {sections.map((section) =>
            section.rows.length === 0 ? null : (
              <div key={section.id}>
                {section.label ? (
                  <p className="border-b border-border/50 px-4 py-2 text-[10px] tracking-[0.16em] text-muted-foreground uppercase sm:px-5">
                    {section.label}
                  </p>
                ) : null}
                <ol className="divide-y divide-border/60">
                  {section.rows.map((row) => (
                    <li key={row.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <span className="text-[11px] font-medium tabular-nums text-muted-foreground/70">{row.rank}</span>
                          <span className="label-context">{row.domain}</span>
                          <StatusBadge tone={severityTone(row.band)}>{row.band}</StatusBadge>
                          <span className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                            {confidenceLabel(row.confidence)}
                          </span>
                        </div>
                        <p className="text-[15px] leading-snug font-medium tracking-tight">{row.title}</p>
                        <p className="text-sm leading-relaxed text-muted-foreground">{row.reason}</p>
                        <p className="text-xs leading-relaxed text-foreground/75">{row.impact}</p>
                        <p className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                          {row.relatedDomains.join(" → ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
                          <Link href={row.href}>View</Link>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-11 sm:min-h-8"
                          onClick={() => explain(row)}
                          disabled={pendingId !== null}
                          aria-label={`Explain ${row.title}`}
                        >
                          {pendingId === row.id ? <Loader2 className="size-4 animate-spin" /> : "Explain"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )
          )}
        </div>
      )}

      {data.changeNote ? (
        <p className={cn("border-t border-border/70 px-4 py-3 text-xs text-muted-foreground sm:px-5")}>{data.changeNote}</p>
      ) : null}
      {error ? <p className="px-4 py-2 text-xs text-destructive sm:px-5">{error}</p> : null}
      {explanation ? <ExplanationBlock explanation={explanation} /> : null}
    </section>
  );
}
