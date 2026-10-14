"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import type { AttentionSeverity } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { MaterialInspectSheet } from "@/components/materials/MaterialInspectSheet";
import {
  formatDay,
  formatQty,
  priorityRank,
  priorityTone,
  shortageLabel,
  shortageTone,
} from "@/components/materials/material-display";
import { usePreferences } from "@/components/providers/preferences-provider";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { MATERIAL_VIEWS, type MaterialsSnapshot, type MaterialViewId } from "@/lib/materials/types";
import { useCompactLayout } from "@/hooks/use-compact-layout";

const VIEW_LABEL: Record<MaterialViewId, string> = {
  requirements: "All requirements",
  shortages: "Shortages",
  procurement: "Procurement",
};

const KPI_IDS = ["at-risk", "shortages", "critical", "orders"] as const;

function materialSeverity(row: MaterialsSnapshot["materials"][number]): AttentionSeverity {
  if (row.risk === "CRITICAL" || row.shortageStatus === "SHORTAGE") return "CRITICAL";
  if (row.risk === "HIGH" || row.shortageStatus === "AT_RISK") return "HIGH";
  if (row.risk === "MEDIUM") return "MEDIUM";
  return "WATCH";
}

function materialIssue(row: MaterialsSnapshot["materials"][number]): string {
  if (row.attention) return `${row.name} — procurement attention`;
  if (row.shortageStatus === "SHORTAGE") return `${row.name} — confirmed shortage`;
  if (row.shortageStatus === "AT_RISK") return `${row.name} — projected at risk`;
  return `${row.name} — ${row.risk} risk`;
}

export function MaterialsWorkspaceSimple({ data }: { data: MaterialsSnapshot }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const { setLayoutMode } = usePreferences();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("material"));
  const selected = data.materials.find((row) => row.productId === selectedId) ?? null;

  useEffect(() => {
    const id = searchParams.get("material");
    setSelectedId(id);
  }, [searchParams]);

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const kpis = KPI_IDS.map((id) => data.kpis.find((row) => row.id === id)).filter(Boolean) as MaterialsSnapshot["kpis"];

  const attentionMaterials = useMemo(
    () =>
      [...data.materials]
        .filter(
          (row) =>
            row.shortageStatus === "SHORTAGE" ||
            row.shortageStatus === "AT_RISK" ||
            row.risk === "CRITICAL" ||
            row.risk === "HIGH" ||
            row.attention
        )
        .sort((a, b) => priorityRank(b.priorityLevel) - priorityRank(a.priorityLevel))
        .slice(0, 8),
    [data.materials]
  );

  const productionImpact = useMemo(() => {
    const map = new Map<
      string,
      { orderNumber: string; productName: string; materials: number; priority: MaterialsSnapshot["materials"][number]["priorityLevel"] }
    >();
    for (const row of data.materials) {
      if (row.shortageStatus !== "SHORTAGE" && row.shortageStatus !== "AT_RISK") continue;
      for (const order of row.affectedOrders) {
        const current = map.get(order.id) ?? {
          orderNumber: order.orderNumber,
          productName: order.productName,
          materials: 0,
          priority: row.priorityLevel,
        };
        current.materials += 1;
        if (priorityRank(row.priorityLevel) > priorityRank(current.priority)) {
          current.priority = row.priorityLevel;
        }
        map.set(order.id, current);
      }
    }
    return [...map.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
      .slice(0, 6);
  }, [data.materials]);

  const listRows = useMemo(() => {
    const rows = [...data.materials];
    rows.sort((a, b) => priorityRank(b.priorityLevel) - priorityRank(a.priorityLevel));
    return rows.slice(0, 15);
  }, [data.materials]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {data.bomCycles.length > 0 ? (
        <p className="work-surface px-3 py-2 text-sm text-warning" role="status">
          Circular BOM on {data.bomCycles.map((row) => row.orderNumber).join(", ")} — demand not calculated for those orders.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Material views" className="flex flex-wrap gap-1">
          {MATERIAL_VIEWS.map((view) => (
            <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
              <Link href={href({ view })}>{VIEW_LABEL[view]}</Link>
            </Button>
          ))}
        </nav>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
          Full MRP table
        </Button>
      </div>

      <section aria-label="Material KPIs" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="work-surface px-4 py-3">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="metric-value mt-1 text-xl">{kpi.value}</p>
          </div>
        ))}
      </section>

      <AttentionList
        title="Material pressure"
        subtitle={
          attentionMaterials.length === 0
            ? "No shortages or elevated risk in this view."
            : `${attentionMaterials.length} material${attentionMaterials.length === 1 ? "" : "s"} need review`
        }
      >
        {attentionMaterials.map((row) => (
          <AttentionItem
            key={row.productId}
            domain="Materials"
            severity={materialSeverity(row)}
            issue={materialIssue(row)}
            href={href({ material: row.productId })}
            actionLabel="Inspect"
          />
        ))}
      </AttentionList>

      {productionImpact.length > 0 ? (
        <section aria-label="Production impact" className="work-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Production at risk</p>
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
              <Link href="/operations">Operations</Link>
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {productionImpact.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{row.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">{row.productName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{row.materials} materials</span>
                  <StatusBadge tone={priorityTone[row.priority]}>{row.priority}</StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {listRows.length === 0 ? (
        <EmptyState
          title={data.emptyReason ? "No material requirements" : "No rows"}
          description={data.emptyReason ?? "Try another view or clear filters."}
        />
      ) : (
        <section aria-label="Materials list" className="work-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">
              {data.view === "shortages" ? "Shortages" : data.view === "procurement" ? "Procurement queue" : "Top priorities"}
            </p>
            <p className="text-xs text-muted-foreground">Tap a row for balance and production links.</p>
          </div>
          <ul className="divide-y divide-border">
            {listRows.map((row) => (
              <li key={row.productId}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  onClick={() => setSelectedId(row.productId)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.sku} · Net {formatQty(row.netRequirement)} {row.unit}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge tone={shortageTone[row.shortageStatus]}>{shortageLabel[row.shortageStatus]}</StatusBadge>
                    <span className="text-xs text-muted-foreground">Due {formatDay(row.earliestDueDate)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-4 py-3">
            <Button type="button" size="sm" variant="ghost" className="min-h-11 w-full sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
              Open full table for charts, filters, and BOM detail
            </Button>
          </div>
        </section>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-lg"}
        >
          {selected ? <MaterialInspectSheet row={selected} compact /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
