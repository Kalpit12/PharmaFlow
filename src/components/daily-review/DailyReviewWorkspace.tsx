"use client";

import Link from "next/link";

import { TodayOnboarding } from "@/components/daily-review/TodayOnboarding";
import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import { IntelligenceSurface } from "@/components/intelligence/IntelligenceSurface";
import { useLayoutMode } from "@/components/providers/preferences-provider";
import type { DailyReviewSnapshot, DailySeverity, DomainHealthStatus } from "@/lib/daily-review/types";
import { cn } from "@/lib/utils";

function healthTone(status: DomainHealthStatus): "danger" | "warning" | "neutral" | "success" {
  if (status === "CRITICAL") return "danger";
  if (status === "ATTENTION" || status === "LIMITED_DATA") return "warning";
  return "success";
}

export function DailyReviewWorkspace({ data }: { data: DailyReviewSnapshot }) {
  const { simple } = useLayoutMode();
  const attentionCount = data.attention.length;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <TodayOnboarding />

      <AttentionList
        title="Management Attention"
        subtitle={
          attentionCount === 0
            ? "Nothing requires attention right now."
            : `${attentionCount} issue${attentionCount === 1 ? "" : "s"} need attention`
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

      {simple ? (
        <section className="flex flex-wrap gap-3">
          {[
            { label: "Production at risk", value: data.context.productionAtRisk, href: "/operations" },
            { label: "Material shortages", value: data.context.materialShortages, href: "/materials?view=shortages" },
            { label: "Pending requisitions", value: data.context.pendingRequisitions, href: "/procurement" },
            { label: "Open attention", value: data.context.openAttention, href: "/execution" },
          ].map((kpi) => (
            <Link
              key={kpi.label}
              href={kpi.href}
              className="min-w-[9rem] flex-1 rounded-sm border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="metric-value mt-1 text-xl">{kpi.value}</p>
            </Link>
          ))}
        </section>
      ) : (
        <>
          <div>
            <p className="label-context">Domain health</p>
            <p className="mt-1 text-sm text-muted-foreground">Compact status across operational domains.</p>
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

          <IntelligenceSurface
            data={data.intelligence}
            title="Today's operational priorities"
            subtitle="Critical, high, and watch items ranked from recorded operational facts."
            grouped
          />

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

          <footer className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
            <Link href="/command-center" className="hover:text-foreground">Command Center</Link>
            <span aria-hidden>·</span>
            <Link href="/reports" className="hover:text-foreground">Reports</Link>
            <span aria-hidden>·</span>
            <Link href="/operations" className="hover:text-foreground">Operations</Link>
            <span aria-hidden>·</span>
            <Link href="/materials" className="hover:text-foreground">Materials</Link>
          </footer>
        </>
      )}

      {simple ? (
        <p className="text-center text-xs text-muted-foreground">
          Need charts and full detail?{" "}
          <Link href="/settings#preferences" className="text-primary hover:underline">Enable Advanced layout</Link>
          {" · "}
          <Link href="/command-center" className="text-primary hover:underline">Command Center</Link>
        </p>
      ) : null}
    </div>
  );
}
