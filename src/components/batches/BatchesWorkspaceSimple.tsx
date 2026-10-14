"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BatchDetailSheet } from "@/components/batches/BatchDetailSheet";
import { formatDay, qualityLabel, qualityTone, riskRank, riskTone, VIEW_LABEL } from "@/components/batches/batch-display";
import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import type { AttentionSeverity } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { StatusBadge } from "@/components/ds/status-badge";
import { usePreferences } from "@/components/providers/preferences-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import type { BatchQualityViewId, BatchesSnapshot } from "@/lib/batches/types";

const SIMPLE_VIEWS: BatchQualityViewId[] = ["review", "hold", "all"];
const KPI_IDS = ["review", "hold", "released", "active"] as const;

function attentionSeverity(severity: string): AttentionSeverity {
  if (severity === "CRITICAL" || severity === "HIGH") return severity as AttentionSeverity;
  return "WATCH";
}

export function BatchesWorkspaceSimple({ data }: { data: BatchesSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const { setLayoutMode } = usePreferences();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("batch"));

  useEffect(() => {
    const fromUrl = searchParams.get("batch");
    if (fromUrl) setSelectedId(fromUrl);
  }, [searchParams]);

  const selected =
    data.batches.find((row) => row.id === selectedId) ??
    data.batches.find((row) => row.id === searchParams.get("batch")) ??
    null;

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const kpis = KPI_IDS.map((id) => data.kpis.find((row) => row.id === id)).filter(Boolean) as BatchesSnapshot["kpis"];

  const listRows = useMemo(() => {
    return [...data.batches]
      .sort((a, b) => riskRank[b.risk] - riskRank[a.risk] || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 15);
  }, [data.batches]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Batch views" className="flex flex-wrap gap-1">
          {SIMPLE_VIEWS.map((view) => (
            <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
              <Link href={href({ view: view === "all" ? undefined : view })}>{VIEW_LABEL[view]}</Link>
            </Button>
          ))}
        </nav>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
          Full batch table
        </Button>
      </div>

      <section aria-label="Batch KPIs" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="work-surface px-4 py-3">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="metric-value mt-1 text-xl">{kpi.value}</p>
          </div>
        ))}
      </section>

      <AttentionList
        title="Batch quality"
        subtitle={data.attention.length === 0 ? "No batches need an immediate quality decision." : "Batches that need review or are on hold."}
      >
        {data.attention.length === 0 ? (
          <AttentionItem domain="Batches" severity="INFO" issue="No batch quality exceptions in this view." href="/batches?view=review" actionLabel="Review" />
        ) : (
          data.attention.slice(0, 6).map((item) => (
            <AttentionItem
              key={item.id}
              domain="Batches"
              severity={attentionSeverity(item.severity)}
              issue={item.title}
              evidence={item.detail}
              href={item.href}
              actionLabel="Open"
            />
          ))
        )}
      </AttentionList>

      {listRows.length === 0 ? (
        <EmptyState title="No batches to show" description={data.emptyReason ?? "Switch view or use advanced layout to search."} />
      ) : (
        <section aria-label="Priority batches" className="work-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Batches to review</p>
            <p className="text-xs text-muted-foreground">Sorted by risk — tap a row for hold, release, or reject.</p>
          </div>
          <ul className="divide-y divide-border">
            {listRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => setSelectedId(row.id)}
                >
                  <div className="min-w-0">
                    <p className="font-medium">{row.batchNumber}</p>
                    <p className="text-xs text-muted-foreground">{row.productName} · {row.orderNumber}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={qualityTone[row.qualityStatus]}>{qualityLabel[row.qualityStatus]}</StatusBadge>
                    <StatusBadge tone={riskTone[row.risk]}>{row.risk}</StatusBadge>
                    <span className="text-xs text-muted-foreground">{formatDay(row.updatedAt)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-lg"}
        >
          {selected ? (
            <BatchDetailSheet
              row={selected}
              compact
              canQualityAction={data.capabilities.canQualityAction}
              onComplete={() => router.refresh()}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
