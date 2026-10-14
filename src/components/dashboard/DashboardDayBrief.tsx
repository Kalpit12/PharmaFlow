"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { normalizeAiBriefing, parseSignalMetric } from "@/lib/dashboard/ai-briefing-display";
import type { DashboardDayBrief } from "@/lib/dashboard/day-brief";
import { cn } from "@/lib/utils";

const DAILY_BRIEFING_QUESTION =
  "What should I prioritize today? Reply with summary as ONE sentence under 20 words, and keySignals as exactly 3 short lines. Each keySignal must start with the count or metric number, then a few words of context. No long paragraphs.";

type AiBriefState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; summary: string; signals: string[] }
  | { status: "error"; message?: string };

function AiBriefingBlock({ summary, signals }: { summary: string; signals: string[] }) {
  const { lead, items } = useMemo(() => normalizeAiBriefing(summary, signals), [summary, signals]);

  if (items.length === 0 && !lead) return null;

  return (
    <div className="mt-4 rounded-sm border border-border/80 bg-background/80 px-4 py-3 sm:px-5">
      <p className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">AI briefing</p>
      {lead ? <p className="mt-2 text-sm font-medium leading-snug text-foreground">{lead}</p> : null}
      {items.length > 0 ? (
        <ol className={cn("space-y-0", lead ? "mt-3" : "mt-2")}>
          {items.map((line, index) => {
            const { metric, body } = parseSignalMetric(line);
            return (
              <li
                key={`${index}-${line.slice(0, 24)}`}
                className="flex gap-3 border-t border-border/50 py-3 first:border-t-0 first:pt-0"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary/12 text-sm font-semibold tabular-nums text-primary"
                  aria-hidden
                >
                  {metric ?? index + 1}
                </span>
                <p className="min-w-0 pt-1 text-sm leading-snug text-foreground/90">{metric ? body : line}</p>
              </li>
            );
          })}
        </ol>
      ) : lead && items.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{summary}</p>
      ) : null}
    </div>
  );
}

export function DashboardDayBrief({ brief }: { brief: DashboardDayBrief }) {
  const [ai, setAi] = useState<AiBriefState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    setAi({ status: "loading" });
    void (async () => {
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: DAILY_BRIEFING_QUESTION }),
        });
        const body = (await res.json()) as {
          response?: { summary?: string; keySignals?: string[] };
          message?: string;
        };
        if (cancelled) return;
        const summary = body.response?.summary?.trim() ?? "";
        const signals = body.response?.keySignals?.filter((s) => typeof s === "string" && s.trim()) ?? [];
        if (!res.ok || (!summary && signals.length === 0)) {
          setAi({
            status: "error",
            message: body.message ?? "AI briefing is unavailable. The summary above is from your live workspace data.",
          });
          return;
        }
        setAi({
          status: "ready",
          summary,
          signals: signals.slice(0, 5),
        });
      } catch {
        if (!cancelled) setAi({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="work-surface border-primary/25 bg-gradient-to-br from-primary/8 via-background to-background p-4 sm:p-5"
      aria-label="Your day"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary/15 text-primary">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-[10px] font-medium tracking-[0.14em] text-primary uppercase">Pharmaflow AI · Your day</p>
            <p className="text-sm text-muted-foreground">{brief.greeting}</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="min-h-11 shrink-0 sm:min-h-8">
          <Link href="/ai">Open assistant</Link>
        </Button>
      </div>

      <h2 className="mt-4 text-lg font-medium tracking-tight">{brief.headline}</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-snug text-muted-foreground">{brief.summary}</p>

      {ai.status === "loading" ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          AI is reading today&apos;s workspace signals…
        </p>
      ) : null}

      {ai.status === "ready" ? <AiBriefingBlock summary={ai.summary} signals={ai.signals} /> : null}

      {ai.status === "error" ? (
        <p className="mt-4 text-sm text-muted-foreground">{ai.message}</p>
      ) : null}

      {brief.commercialHint ? (
        <p className="mt-3 text-xs text-muted-foreground">{brief.commercialHint}</p>
      ) : null}

      {brief.priorities.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {brief.priorities.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className={cn(
                  "inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-sm border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 sm:min-h-9 sm:w-auto"
                )}
              >
                <span className="truncate">{item.label}</span>
                <ArrowRight className="size-3.5 shrink-0 text-primary" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm">
          <Link href="/daily-review" className="text-primary hover:underline">Open Today</Link>
          {" "}for the full operational queue.
        </p>
      )}
    </section>
  );
}
