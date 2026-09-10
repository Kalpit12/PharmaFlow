"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { FunnelChart } from "@/components/charts/FunnelChart";
import { GroupedBarChart } from "@/components/charts/GroupedBarChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { LineComboChart } from "@/components/charts/LineComboChart";
import { StackedPercentBar } from "@/components/charts/StackedPercentBar";
import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { MetricStrip } from "@/components/ds/metric-strip";
import { Button } from "@/components/ui/button";
import type { CommandCenterSnapshot, CommandSeverity } from "@/lib/command-center/types";
import type { StructuredAIResponse } from "@/lib/ai/response";
import { cn } from "@/lib/utils";

function healthTone(severity: CommandCenterSnapshot["health"][number]["severity"]) {
  if (severity === "CRITICAL") return "danger" as const;
  if (severity === "ATTENTION") return "warning" as const;
  if (severity === "HEALTHY") return "success" as const;
  return "default" as const;
}

export function CommandCenterWorkspace({ data }: { data: CommandCenterSnapshot }) {
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<StructuredAIResponse | null>(null);

  const stamp = new Date(data.generatedAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });

  const operations = data.summary.find((block) => block.id === "operations");
  const procurement = data.summary.find((block) => block.id === "supply");
  const business = data.summary.find((block) => block.id === "business");
  const analytics = data.analytics;

  async function explainSituation() {
    setLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Explain today's situation across the business." }),
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
    <div className="flex min-w-0 flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-context">Business state</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.contextLabel}
            <span> · Refreshed {stamp} UTC</span>
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={explainSituation} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
          Explain situation
        </Button>
      </div>

      <MetricStrip
        aria-label="Business state"
        items={data.health.map((row) => ({
          id: row.id,
          label: row.label,
          value: row.value,
          hint: row.trend,
          href: row.href,
          tone: healthTone(row.severity),
        }))}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <AttentionList
            title="Management Attention"
            subtitle="Highest-value cross-domain signals."
            empty={
              data.signals.length === 0 ? (
                <EmptyState
                  className="border-0 px-4 py-10"
                  title="Nothing requires immediate attention"
                  description={data.emptyReason ?? "Operational domains are within expected thresholds."}
                />
              ) : undefined
            }
          >
            {data.signals.map((signal, index) => (
              <AttentionItem
                key={signal.id}
                rank={index + 1}
                domain={signal.domain}
                severity={signal.severity}
                issue={signal.title}
                evidence={signal.explanation}
                consequence={`${signal.entity}${signal.nextStep ? ` · ${signal.nextStep}` : ""}`}
                href={signal.href}
                actionLabel="Inspect"
              />
            ))}
          </AttentionList>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
          <section>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium tracking-tight">Operational pulse</h2>
              {operations ? (
                <Link href={operations.href} className="text-[11px] tracking-[0.08em] text-primary uppercase">
                  Open operations →
                </Link>
              ) : null}
            </div>
            {operations ? (
              <dl className="mt-3 space-y-2.5 border-t border-border pt-3">
                {operations.lines.map((line) => (
                  <div key={line.label} className="flex items-start justify-between gap-3 text-sm">
                    <dt className="text-muted-foreground">{line.label}</dt>
                    <dd className={cn("metric-value text-right", !line.available && "text-muted-foreground")}>{line.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Production pulse unavailable.</p>
            )}
          </section>

          <section className="border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium tracking-tight">Action queue</h2>
              <Link href="/execution" className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase hover:text-foreground">
                Execution →
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              {[
                { label: "Review", value: data.actionQueue.needsReview },
                { label: "Ready", value: data.actionQueue.ready },
                { label: "Executed", value: data.actionQueue.recentlyExecuted },
                { label: "Blocked", value: data.actionQueue.failedOrBlocked },
              ].map((kpi) => (
                <div key={kpi.label}>
                  <p className="label-context">{kpi.label}</p>
                  <p className="metric-value mt-1 text-lg">{kpi.value}</p>
                </div>
              ))}
            </div>
            {data.actionQueue.preview.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No actions awaiting review.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border/70">
                {data.actionQueue.preview.slice(0, 3).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.domain} · {item.status.replaceAll("_", " ")}
                      </p>
                    </div>
                    <Link href={item.href} className="shrink-0 text-[11px] text-primary">
                      Review
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="border-t border-border pt-6">
        <p className="label-context">Analytical command layer</p>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <LineComboChart
              dominant
              title="Revenue & Order Trend"
              description="Confirmed + fulfilled orders, trailing 30 days. Revenue in KSh millions."
              points={analytics.revenueTrend.points}
              emptyMessage={analytics.errors.revenue ?? "No data available for this period."}
            />
          </div>
          <div className="min-w-0 lg:col-span-4">
            <HorizontalBarChart
              title="Revenue by Product"
              description="Top products by realized revenue (KSh M)."
              rows={analytics.revenueByProduct}
              valueSuffix="M"
              emptyMessage="No realized product revenue in this period."
            />
          </div>
          <div className="min-w-0 lg:col-span-6">
            <GroupedBarChart
              title="Production: Planned vs Actual"
              description="Open pipeline quantity vs completed production output."
              rows={analytics.productionPlannedVsActual}
              note={analytics.productionNote}
              emptyMessage={analytics.errors.operations ?? "No production orders in this workspace."}
            />
          </div>
          <div className="min-w-0 lg:col-span-6">
            <HorizontalBarChart
              title="Workstation Capacity"
              description="Finite-capacity utilization from the operations planner."
              rows={analytics.workstationCapacity}
              valueSuffix="%"
              emptyMessage={analytics.errors.operations ?? "Capacity data unavailable."}
            />
          </div>
          <div className="min-w-0 lg:col-span-6">
            <StackedPercentBar
              title="Inventory Health"
              description="On-hand quantity by stock health and expiry exposure."
              segments={analytics.inventoryHealth}
              emptyMessage={analytics.errors.inventory ?? "Inventory health unavailable."}
            />
          </div>
          <div className="min-w-0 lg:col-span-6">
            <FunnelChart
              title="Procurement Pipeline"
              description="Independent stage counts across requisition through receiving."
              stages={analytics.procurementPipeline}
            />
          </div>
        </div>
      </section>

      <div className="grid min-w-0 gap-8 border-t border-border pt-6 lg:grid-cols-2">
        <SummaryColumn
          title="Procurement"
          href={procurement?.href ?? "/procurement"}
          lines={procurement?.lines ?? []}
        />
        <SummaryColumn
          title="Commercial"
          href={business?.href ?? "/dashboard"}
          lines={business?.lines ?? []}
        />
      </div>

      {data.risks.length > 0 ? (
        <section className="border-t border-border pt-6">
          <h2 className="text-sm font-medium tracking-tight">Top risks</h2>
          <ul className="mt-3 divide-y divide-border/70">
            {data.risks.map((risk) => (
              <li key={risk.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="label-context">{risk.category}</span>
                    <span className={cn("text-[10px] tracking-[0.12em] uppercase", isHigh(risk.level) ? "text-danger" : "text-muted-foreground")}>
                      {risk.level}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{risk.explanation}</p>
                </div>
                <Link href={risk.href} className="shrink-0 text-[11px] text-primary">
                  View
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-t border-border pt-6">
        <h2 className="text-sm font-medium tracking-tight">Recent activity</h2>
        {data.activity.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/70">
            {data.activity.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.entity}</p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{item.at}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(explanation || aiError || loading) && (
        <section className="border-t border-border pt-6">
          <h2 className="text-sm font-medium tracking-tight">Interpretation</h2>
          {loading && <p className="mt-2 text-sm text-muted-foreground">Generating explanation…</p>}
          {aiError && <p className="mt-2 text-sm text-muted-foreground">Explanation unavailable. Deterministic signals remain usable.</p>}
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

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-4 text-[11px] text-muted-foreground">
        <Link href="/daily-review" className="hover:text-foreground">
          Daily Review
        </Link>
        <span aria-hidden>·</span>
        <Link href="/reports" className="hover:text-foreground">
          Reports
        </Link>
        <span aria-hidden>·</span>
        <Link href="/forecast" className="hover:text-foreground">
          Forecast
        </Link>
        <span aria-hidden>·</span>
        <Link href="/scenarios" className="hover:text-foreground">
          Scenarios
        </Link>
        <span className="w-full sm:ml-auto sm:w-auto">{data.planningNote}</span>
      </footer>
    </div>
  );
}

function isHigh(level: CommandSeverity) {
  return level === "CRITICAL" || level === "HIGH";
}

function SummaryColumn({
  title,
  href,
  lines,
}: {
  title: string;
  href: string;
  lines: Array<{ label: string; value: string; available: boolean }>;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium tracking-tight">{title}</h2>
        <Link href={href} className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase hover:text-foreground">
          Open →
        </Link>
      </div>
      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No {title.toLowerCase()} figures.</p>
      ) : (
        <dl className="mt-3 space-y-2.5">
          {lines.map((line) => (
            <div key={line.label} className="flex items-start justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{line.label}</dt>
              <dd className={cn("metric-value text-right", !line.available && "text-muted-foreground")}>{line.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
