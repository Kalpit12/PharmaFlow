"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/ds/empty-state";
import { SupplierDetailSheet } from "@/components/suppliers/SupplierDetailSheet";
import { coverageTone, toneByStatus, VIEW_LABEL } from "@/components/suppliers/supplier-display";
import { usePreferences } from "@/components/providers/preferences-provider";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import type { MaterialSupplierSnapshot, SupplierDetail, SupplierSnapshot, SupplierViewId } from "@/lib/suppliers/types";

const SIMPLE_VIEWS: SupplierViewId[] = ["active", "gaps", "all"];
const KPI_IDS = ["active", "materials", "preferred", "coverage"] as const;

export function SupplierWorkspaceSimple({
  data,
  details,
  materialView,
}: {
  data: SupplierSnapshot;
  details: Record<string, SupplierDetail>;
  materialView: MaterialSupplierSnapshot | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const { setLayoutMode } = usePreferences();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const listRows = useMemo(() => {
    return [...data.rows].sort((a, b) => b.leadTimeCoverage - a.leadTimeCoverage || a.name.localeCompare(b.name)).slice(0, 15);
  }, [data.rows]);

  const kpis = KPI_IDS.map((id) => data.kpis.find((row) => row.id === id)).filter(Boolean) as SupplierSnapshot["kpis"];
  const selected = selectedId ? details[selectedId] ?? null : null;

  const coveragePercent = Number.parseInt((data.kpis.find((k) => k.id === "coverage")?.value ?? "0").replace(/%/g, ""), 10) || 0;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {materialView ? (
        <section className="work-surface p-4">
          <p className="text-xs text-muted-foreground">Material view</p>
          <h2 className="text-sm font-semibold">{materialView.materialName}</h2>
          <p className="mt-1 text-sm">{materialView.recommendation.title}: {materialView.recommendation.reason}</p>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Supplier views" className="flex flex-wrap gap-1">
          {SIMPLE_VIEWS.map((view) => (
            <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
              <Link href={href({ view })}>{VIEW_LABEL[view]}</Link>
            </Button>
          ))}
        </nav>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
          Filters & table
        </Button>
      </div>

      <section aria-label="Supplier KPIs" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="work-surface px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              {kpi.id === "coverage" ? (
                <StatusBadge tone={coverageTone(coveragePercent)}>{coveragePercent >= 50 ? "OK" : "Gap"}</StatusBadge>
              ) : null}
            </div>
            <p className="metric-value mt-1 text-xl tabular-nums">{kpi.value}</p>
            {kpi.hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{kpi.hint}</p> : null}
          </div>
        ))}
      </section>

      {listRows.length === 0 ? (
        <EmptyState title="No suppliers to show" description={data.emptyReason ?? "Broaden filters in advanced layout."} />
      ) : (
        <section aria-label="Suppliers" className="work-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Supplier directory</p>
            <p className="text-xs text-muted-foreground">{data.dataCoverageNote}</p>
          </div>
          <ul className="divide-y divide-border">
            {listRows.map((row) => (
              <li key={row.supplierId}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => setSelectedId(row.supplierId)}
                >
                  <div className="min-w-0">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.code}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={toneByStatus[row.status]}>{row.status}</StatusBadge>
                    <StatusBadge tone={coverageTone(row.leadTimeCoverage)}>{row.leadTimeCoverage}% lead data</StatusBadge>
                    <span className="text-xs text-muted-foreground">{row.materialsCovered} materials</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        <Link href="/rfqs" className="font-medium text-foreground hover:underline">View RFQs</Link>
        {" · "}
        <Link href="/supplier-performance" className="font-medium text-foreground hover:underline">Compare performance</Link>
      </p>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side={compact ? "bottom" : "right"} className={compact ? "max-h-[85vh] overflow-y-auto" : "overflow-y-auto sm:max-w-lg"}>
          {selected ? <SupplierDetailSheet row={selected} compact /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
