"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { DailyReviewSnapshot, DailySeverity, DomainHealthStatus } from "@/lib/daily-review/types";
import type { StructuredAIResponse } from "@/lib/ai/response";
import { cn } from "@/lib/utils";

function healthTone(status: DomainHealthStatus): "danger" | "warning" | "neutral" | "success" {
  if (status === "CRITICAL") return "danger";
  if (status === "ATTENTION" || status === "LIMITED_DATA") return "warning";
  return "success";
}

export function DailyReviewWorkspace({ data }: { data: DailyReviewSnapshot }) {
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<StructuredAIResponse | null>(null);

  async function explainPriorities() {
    setLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Explain today's priorities across operations and procurement." }),
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
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-context">Domain health</p>
          <p className="mt-1 text-sm text-muted-foreground">Compact status across operational domains.</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={explainPriorities} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
          Explain priorities
        </Button>
      </div>
      <div className="flex gap-0 overflow-x-auto border-y border-border [scrollbar-width:thin]">
          {data.health.map((row, index) => (
            <div
              key={row.id}
              className={cn("min-w-[8rem] shrink-0 px-3 py-1", index > 0 && "border-l border-border/50")}
            >
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{row.label}</p>
                <StatusBadge tone={healthTone(row.status)} className="rounded-sm px-1.5 py-0">
                  {row.status.replace(/_/g, " ")}
                </StatusBadge>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{row.hint}</p>
            </div>
          ))}
      </div>

      <AttentionList
        title="Management Attention"
        subtitle={
          data.attention.length === 0
            ? "Nothing requires attention right now."
            : `${data.attention.length} issue${data.attention.length === 1 ? "" : "s"} need attention`
        }
        empty={
          data.emptyReason ? (
            <EmptyState className="border-0 bg-transparent px-4 py-10" title="All clear for now" description={data.emptyReason} />
          ) : undefined
        }
      >
        {data.attention.map((item, index) => (
          <AttentionItem
            key={item.id}
            rank={index + 1}
            domain={item.domain}
            severity={item.severity as DailySeverity}
            issue={item.title}
            evidence={item.summary}
            consequence={item.reason}
            href={item.href}
            actionLabel={item.actionLabel}
          />
        ))}
      </AttentionList>

      <section className="flex gap-0 overflow-x-auto border-y border-border [scrollbar-width:thin]">
        {[
          { label: "Production at risk", value: String(data.context.productionAtRisk) },
          { label: "Material shortages", value: String(data.context.materialShortages) },
          { label: "Pending requisitions", value: String(data.context.pendingRequisitions) },
          { label: "Supplier data gaps", value: String(data.context.supplierGaps) },
          { label: "Inventory critical", value: String(data.context.inventoryCritical) },
          { label: "Open attention", value: String(data.context.openAttention) },
        ].map((kpi, index) => (
          <div key={kpi.label} className={cn("min-w-[8.5rem] flex-1 px-4 py-3", index > 0 && "border-l border-border")}>
            <p className="label-context">{kpi.label}</p>
            <p className="metric-value mt-1 text-lg">{kpi.value}</p>
          </div>
        ))}
      </section>

      {(explanation || aiError || loading) && (
        <section className="border-t border-border pt-6">
          <h2 className="text-sm font-semibold tracking-tight">Interpretation</h2>
          {loading && <p className="mt-2 text-sm text-muted-foreground">Generating explanation…</p>}
          {aiError && <p className="mt-2 text-sm text-muted-foreground">Explanation unavailable. Deterministic attention remains usable.</p>}
          {explanation && (
            <div className="mt-2 space-y-2">
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
        </section>
      )}

      <footer className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
        <Link href="/command-center" className="hover:text-foreground">
          Command Center
        </Link>
        <span aria-hidden>·</span>
        <Link href="/reports" className="hover:text-foreground">
          Reports
        </Link>
        <span aria-hidden>·</span>
        <Link href="/operations" className="hover:text-foreground">
          Operations
        </Link>
        <span aria-hidden>·</span>
        <Link href="/materials" className="hover:text-foreground">
          Materials
        </Link>
      </footer>
    </div>
  );
}
