"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { bandLabel, bandTone, VIEW_LABEL } from "@/components/supplier-performance/supplier-performance-display";
import { usePreferences } from "@/components/providers/preferences-provider";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import type { PerformanceBand, SupplierPerformanceDetail, SupplierPerformanceSnapshot, SupplierPerformanceViewId } from "@/lib/supplier-performance/types";

const SIMPLE_VIEWS: SupplierPerformanceViewId[] = ["attention", "risk", "all"];
const KPI_IDS = ["active", "history", "completion", "discrepancy"] as const;

export function SupplierPerformanceWorkspaceSimple({
  data,
  initialDetail,
}: {
  data: SupplierPerformanceSnapshot;
  initialDetail: SupplierPerformanceDetail | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const { setLayoutMode } = usePreferences();
  const view = (searchParams.get("view") as SupplierPerformanceViewId) || data.view;
  const [detail, setDetail] = useState<SupplierPerformanceDetail | null>(initialDetail);
  const [detailOpen, setDetailOpen] = useState(Boolean(initialDetail));
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const kpis = KPI_IDS.map((id) => data.kpis.find((row) => row.id === id)).filter(Boolean) as SupplierPerformanceSnapshot["kpis"];

  const listRows = useMemo(() => {
    const rank: Record<PerformanceBand, number> = { RISK: 5, WATCH: 4, INSUFFICIENT_DATA: 3, STRONG: 2, EXCELLENT: 1 };
    return [...data.rows].sort((a, b) => rank[b.band] - rank[a.band] || a.name.localeCompare(b.name)).slice(0, 15);
  }, [data.rows]);

  const openDetail = async (supplierId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const result = await fetch(`/api/supplier-performance/${supplierId}`);
      const payload = (await result.json()) as { detail?: SupplierPerformanceDetail; message?: string };
      if (!result.ok || !payload.detail) {
        setError(payload.message ?? "Unable to load supplier detail.");
        return;
      }
      setDetail(payload.detail);
      setDetailOpen(true);
      router.replace(href({ supplier: supplierId }));
    } catch {
      setError("Unable to load supplier detail.");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {data.materialLabel ? (
        <p className="work-surface px-3 py-2 text-sm">
          Material: <span className="font-medium">{data.materialLabel}</span>{" "}
          <Link href={href({ material: undefined })} className="hover:underline">Clear</Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1">
          {SIMPLE_VIEWS.map((id) => (
            <Button key={id} asChild size="sm" variant={view === id ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
              <Link href={href({ view: id === "all" ? undefined : id })}>{VIEW_LABEL[id]}</Link>
            </Button>
          ))}
        </nav>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
          Compare & AI
        </Button>
      </div>

      <section aria-label="Supplier performance KPIs" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="work-surface px-4 py-3">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="metric-value mt-1 text-xl tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </section>

      <AttentionList
        title="Supplier signals"
        subtitle={data.attention.length === 0 ? "No suppliers flagged in this view." : "Review performance gaps before awarding RFQs."}
      >
        {data.attention.length === 0 ? (
          <AttentionItem domain="Suppliers" severity="INFO" issue="No supplier performance alerts." href="/suppliers" actionLabel="Directory" />
        ) : (
          data.attention.slice(0, 6).map((item) => (
            <AttentionItem
              key={item.id}
              domain="Performance"
              severity="HIGH"
              issue={`${item.supplierName}: ${item.title}`}
              evidence={item.evidence}
              href={item.href}
              actionLabel="Review"
            />
          ))
        )}
      </AttentionList>

      {listRows.length === 0 ? (
        <EmptyState title="No supplier performance rows" description={data.emptyReason ?? "Adjust filters in advanced layout."} />
      ) : (
        <section aria-label="Suppliers" className="work-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Supplier performance</p>
            <p className="text-xs text-muted-foreground">{data.planningNote}</p>
          </div>
          <ul className="divide-y divide-border">
            {listRows.map((row) => (
              <li key={row.supplierId}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => void openDetail(row.supplierId)}
                >
                  <div className="min-w-0">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.code}{row.preferred ? " · Preferred" : ""}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={bandTone[row.band]}>{bandLabel(row.band)}</StatusBadge>
                    <span className="text-xs text-muted-foreground">{row.completionRateLabel} complete</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {detailLoading ? <p className="text-sm text-muted-foreground">Loading supplier detail…</p> : null}

      <Sheet
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) router.replace(href({ supplier: undefined }));
        }}
      >
        <SheetContent side={compact ? "bottom" : "right"} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detail?.name ?? "Supplier detail"}</SheetTitle>
            <SheetDescription>Key metrics from RFQ, PO, and receiving history.</SheetDescription>
          </SheetHeader>
          {detail ? (
            <div className="space-y-4 px-4 pb-6 text-sm">
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={bandTone[detail.band]}>{bandLabel(detail.band)}</StatusBadge>
                <StatusBadge tone="info">{detail.confidence} confidence</StatusBadge>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div><dt className="text-[11px] uppercase text-muted-foreground">Response</dt><dd>{detail.metrics.responseRateLabel}</dd></div>
                <div><dt className="text-[11px] uppercase text-muted-foreground">Completion</dt><dd>{detail.metrics.completionRateLabel}</dd></div>
                <div><dt className="text-[11px] uppercase text-muted-foreground">Discrepancy</dt><dd>{detail.metrics.discrepancyRateLabel}</dd></div>
                <div><dt className="text-[11px] uppercase text-muted-foreground">Timing</dt><dd>{detail.metrics.averageReceivingDelayLabel}</dd></div>
              </dl>
              {detail.attentionFlags.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {detail.attentionFlags.slice(0, 4).map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
