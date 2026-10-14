"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import type { AttentionSeverity } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { ProcurementDetailSheet } from "@/components/procurement/ProcurementDetailSheet";
import { formatQty, riskTone, rowStatusLabel, rowStatusTone } from "@/components/procurement/procurement-display";
import { useProcurementActions } from "@/components/procurement/use-procurement-actions";
import { usePreferences } from "@/components/providers/preferences-provider";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { MaterialRisk } from "@/lib/materials/types";
import { PROCUREMENT_VIEWS, type ProcurementSnapshot, type ProcurementViewId } from "@/lib/procurement/types";
import { useCompactLayout } from "@/hooks/use-compact-layout";

const VIEW_LABEL: Record<ProcurementViewId, string> = {
  all: "All",
  critical: "Critical",
  "needs-review": "Needs review",
  reviewed: "Reviewed",
  rejected: "Rejected",
};

const KPI_IDS = ["attention", "critical", "pending", "suggested"] as const;

function severity(risk: MaterialRisk): AttentionSeverity {
  if (risk === "CRITICAL") return "CRITICAL";
  if (risk === "HIGH") return "HIGH";
  if (risk === "MEDIUM") return "MEDIUM";
  return "WATCH";
}

const riskRank: Record<MaterialRisk, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, OK: 0 };

export function ProcurementWorkspaceSimple({
  data,
  canReview,
  initialRequisitionId,
}: {
  data: ProcurementSnapshot;
  canReview: boolean;
  initialRequisitionId?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const { setLayoutMode } = usePreferences();
  const actions = useProcurementActions();

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const kpis = KPI_IDS.map((id) => data.kpis.find((row) => row.id === id)).filter(Boolean) as ProcurementSnapshot["kpis"];

  const attentionRows = useMemo(
    () =>
      [...data.rows]
        .filter((row) => row.risk === "CRITICAL" || row.risk === "HIGH" || row.rowStatus === "DRAFT" || row.rowStatus === "RECOMMENDATION")
        .sort((a, b) => riskRank[b.risk] - riskRank[a.risk])
        .slice(0, 8),
    [data.rows]
  );

  const listRows = useMemo(
    () => [...data.rows].sort((a, b) => riskRank[b.risk] - riskRank[a.risk]).slice(0, 15),
    [data.rows]
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Procurement views" className="flex flex-wrap gap-1">
          {PROCUREMENT_VIEWS.map((view) => (
            <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
              <Link href={href({ view })}>{VIEW_LABEL[view]}</Link>
            </Button>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
            <Link href="/materials?view=shortages">Materials</Link>
          </Button>
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
            Full planning table
          </Button>
        </div>
      </div>

      <section aria-label="Procurement KPIs" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="work-surface px-4 py-3">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="metric-value mt-1 text-xl">{kpi.value}</p>
          </div>
        ))}
      </section>

      <AttentionList
        title="Procurement queue"
        subtitle={
          attentionRows.length === 0
            ? "No critical items in this view."
            : `${attentionRows.length} item${attentionRows.length === 1 ? "" : "s"} to act on`
        }
      >
        {attentionRows.map((row) => (
          <li key={`${row.productId}-${row.requisitionId ?? "rec"}`}>
            <button
              type="button"
              className="flex w-full min-h-11 items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:px-5"
              onClick={() => actions.openRow(row)}
            >
              <span className="min-w-0 text-[15px] font-medium leading-snug">{row.name}</span>
              <span className="shrink-0 text-[11px] font-medium tracking-[0.08em] text-primary uppercase">Review</span>
            </button>
          </li>
        ))}
      </AttentionList>

      {listRows.length === 0 ? (
        <EmptyState
          title={data.emptyReason ? "No procurement needs" : "No rows"}
          description={data.emptyReason ?? "Try another view or check Materials for shortages."}
        />
      ) : (
        <section aria-label="Procurement list" className="work-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Requisitions & recommendations</p>
            <p className="text-xs text-muted-foreground">Open a row to draft or review — no automatic POs.</p>
          </div>
          <ul className="divide-y divide-border">
            {listRows.map((row) => (
              <li key={`${row.productId}-${row.requisitionId ?? "rec"}`}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  onClick={() => actions.openRow(row)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.sku} · Suggest {formatQty(row.suggestedQuantity)} {row.unit}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge tone={riskTone[row.risk]}>{row.risk}</StatusBadge>
                    <StatusBadge tone={rowStatusTone[row.rowStatus]}>{rowStatusLabel[row.rowStatus]}</StatusBadge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-4 py-3">
            <Button type="button" size="sm" variant="ghost" className="min-h-11 w-full sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
              Open full table for filters and supplier detail
            </Button>
          </div>
        </section>
      )}

      <Sheet
        open={actions.selectedRow !== null || Boolean(initialRequisitionId)}
        onOpenChange={(open) => {
          if (!open) actions.closeRow();
        }}
      >
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-lg"}
        >
          {actions.selectedRow ? (
            <ProcurementDetailSheet
              compact
              row={actions.selectedRow}
              detail={actions.detail}
              canReview={canReview}
              busy={actions.busy}
              error={actions.error}
              onCreateDraft={() => void actions.createDraft(actions.selectedRow!.productId)}
              onCreateRfq={() => void actions.createRfq(actions.selectedRow!.productId, actions.detail?.id)}
              onReview={(decision) => actions.detail && void actions.review(actions.detail.id, decision)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
