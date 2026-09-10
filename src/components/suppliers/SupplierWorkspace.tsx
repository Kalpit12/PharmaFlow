"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/ds/empty-state";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import type { MaterialSupplierSnapshot, SupplierDetail, SupplierSnapshot, SupplierViewId } from "@/lib/suppliers/types";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<SupplierViewId, string> = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
  gaps: "Data gaps",
};

const toneByStatus: Record<string, StatusTone> = { ACTIVE: "intel", INACTIVE: "neutral" };

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function SupplierWorkspace({
  data,
  details,
  materialView,
}: {
  data: SupplierSnapshot;
  details: Record<string, SupplierDetail>;
  materialView: MaterialSupplierSnapshot | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"supplier" | "materials" | "lead" | "updated">("supplier");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const rows = useMemo(() => {
    const next = [...data.rows];
    next.sort((a, b) => {
      if (sortKey === "materials") return b.materialsCovered - a.materialsCovered;
      if (sortKey === "lead") return b.leadTimeCoverage - a.leadTimeCoverage;
      if (sortKey === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      return a.name.localeCompare(b.name);
    });
    return next;
  }, [data.rows, sortKey]);

  const selected = selectedId ? details[selectedId] ?? null : null;
  const activeFilters = ["status", "q", "material"].filter((key) => searchParams.get(key)).length;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        {data.dataCoverageNote}{" "}
        <Link href="/rfqs" className="font-medium text-foreground hover:underline">
          View RFQs
        </Link>
      </p>
      {materialView ? (
        <section className="work-surface p-4">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Material supplier view</p>
          <h2 className="mt-1 text-sm font-semibold">{materialView.materialName}</h2>
          <p className="text-xs text-muted-foreground">
            {materialView.materialSku} · {materialView.candidates.length} supplier option{materialView.candidates.length === 1 ? "" : "s"}
          </p>
          <p className="mt-2 text-sm">
            <span className="font-medium">{materialView.recommendation.title}:</span> {materialView.recommendation.reason}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{materialView.comparisonNote}</p>
        </section>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3 work-surface p-3">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Supplier views" className="hidden min-w-0 flex-wrap gap-1 lg:flex">
            {(Object.keys(VIEW_LABEL) as SupplierViewId[]).map((view) => (
              <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-7">
                <Link href={href({ view })}>{VIEW_LABEL[view]}</Link>
              </Button>
            ))}
          </nav>
          <label className="flex min-w-0 items-center gap-2 text-xs font-medium lg:hidden">
            <span className="shrink-0 text-muted-foreground">View</span>
            <select className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm" value={data.view} onChange={(event) => router.push(href({ view: event.target.value }))}>
              {(Object.keys(VIEW_LABEL) as SupplierViewId[]).map((view) => (
                <option key={view} value={view}>
                  {VIEW_LABEL[view]}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">{rows.length} suppliers in scope</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <div className="hidden min-w-0 flex-wrap gap-2 lg:flex">
            <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
              <span className="shrink-0 text-muted-foreground">Status</span>
              <select
                className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
                value={searchParams.get("status") ?? ""}
                onChange={(event) => router.push(href({ status: event.target.value || undefined }))}
              >
                <option value="">All</option>
                {data.statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button type="button" size="sm" variant="outline" className="min-h-11 lg:hidden" onClick={() => setFiltersOpen(true)}>
            Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </Button>
          <SearchInput
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Supplier name or code"
            aria-label="Search suppliers"
            className="md:max-w-56 [&_input]:h-11 md:[&_input]:h-8"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                router.push(href({ q: event.currentTarget.value || undefined }));
              }
            }}
          />
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
            <Link href={pathname}>Clear all</Link>
          </Button>
        </div>
      </div>

      <section aria-label="Supplier metrics" className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="min-w-[9.5rem] shrink-0 border-r border-border px-3.5 py-3 last:border-r-0 xl:min-w-0">
            <p className="min-w-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </section>

      {rows.length === 0 ? (
        <EmptyState title="No suppliers to show" description={data.emptyReason ?? "Adjust filters to broaden supplier scope."} />
      ) : (
        <div className="min-w-0 overflow-hidden work-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                <tr>
                  <SortHead label="Supplier" active={sortKey === "supplier"} onClick={() => setSortKey("supplier")} />
                  <th className="px-3 py-2 font-medium">Status</th>
                  <SortHead label="Materials" active={sortKey === "materials"} onClick={() => setSortKey("materials")} right />
                  <th className="px-3 py-2 text-right font-medium">Preferred</th>
                  <SortHead label="Lead time" active={sortKey === "lead"} onClick={() => setSortKey("lead")} right />
                  <th className="px-3 py-2 text-right font-medium">Price coverage</th>
                  <th className="px-3 py-2 text-right font-medium">Performance coverage</th>
                  <SortHead label="Updated" active={sortKey === "updated"} onClick={() => setSortKey("updated")} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.supplierId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <button type="button" className="text-left hover:underline" onClick={() => setSelectedId(row.supplierId)}>
                        <span className="block font-medium">{row.name}</span>
                        <span className="text-xs text-muted-foreground">{row.code}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={toneByStatus[row.status]}>{row.status}</StatusBadge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.materialsCovered}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.preferredMaterials}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.leadTimeCoverage}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.priceCoverage}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.performanceCoverage}</td>
                    <td className="px-3 py-2">{formatDay(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:max-w-none">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow supplier intelligence.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">
            <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
              <span className="shrink-0 text-muted-foreground">Status</span>
              <select
                className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
                value={searchParams.get("status") ?? ""}
                onChange={(event) => router.push(href({ status: event.target.value || undefined }))}
              >
                <option value="">All</option>
                {data.statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side={compact ? "bottom" : "right"} className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-lg"}>
          {selected ? <SupplierDetailView row={selected} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SortHead({ label, active, onClick, right }: { label: string; active: boolean; onClick: () => void; right?: boolean }) {
  return (
    <th className={right ? "px-3 py-2 text-right font-medium" : "px-3 py-2 font-medium"}>
      <button type="button" onClick={onClick} className={active ? "text-foreground" : "hover:text-foreground"}>
        {label}
      </button>
    </th>
  );
}

function SupplierDetailView({ row }: { row: SupplierDetail }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{row.name}</SheetTitle>
        <SheetDescription>
          {row.code} · {row.status}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6 text-sm">
        <section>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Material coverage</p>
          <p className="mt-2 text-muted-foreground">
            {row.materials.length} materials · {row.materials.filter((item) => item.preferred).length} preferred
          </p>
          <ul className="mt-2 space-y-2">
            {row.materials.map((item) => (
              <li key={`${item.productId}-${item.sku}`} className="rounded-lg border border-border px-3 py-2">
                <p className="font-medium">
                  {item.name} <span className="text-xs text-muted-foreground">({item.sku})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Lead time: {item.leadTimeDays !== null ? `${item.leadTimeDays} days` : "Not available"} · MOQ:{" "}
                  {item.minimumOrderQuantity !== null ? item.minimumOrderQuantity.toLocaleString("en-KE") : "Not available"} · Price:{" "}
                  {item.unitPrice !== null ? `${item.currency ?? "—"} ${item.unitPrice.toLocaleString("en-KE", { maximumFractionDigits: 2 })}` : "Not available"}
                </p>
                {item.preferred ? <p className="mt-1 text-xs text-success">Preferred material supplier</p> : null}
                <Link href={`/procurement?material=${item.productId}`} className="mt-1 inline-block text-xs hover:underline">
                  Compare from procurement
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Commercial data</p>
          <p className="mt-2 text-muted-foreground">
            Known prices: {row.knownPrices} · Lead-time records: {row.leadTimeKnown}
          </p>
        </section>
        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Performance</p>
          <p className="mt-2 text-muted-foreground">
            {row.performanceAvailable ? "Historical performance available." : "Historical performance data not available."}
          </p>
        </section>
      </div>
    </>
  );
}
