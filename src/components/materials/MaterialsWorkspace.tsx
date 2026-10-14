"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { GroupedBarChart } from "@/components/charts/GroupedBarChart";
import { EmptyState } from "@/components/ds/empty-state";
import { ProcessTrail } from "@/components/ds/process-trail";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { buildMaterialBalanceRows } from "@/lib/analytics/materials";
import { MaterialInspectSheet } from "@/components/materials/MaterialInspectSheet";
import { MaterialsWorkspaceSimple } from "@/components/materials/MaterialsWorkspaceSimple";
import {
  formatDay,
  formatQty,
  priorityRank,
  priorityTone,
  riskTone,
  shortageLabel,
  shortageTone,
} from "@/components/materials/material-display";
import { useLayoutMode } from "@/components/providers/preferences-provider";
import {
  MATERIAL_RISKS,
  MATERIAL_VIEWS,
  type MaterialPriorityLevel,
  type MaterialRisk,
  type MaterialsSnapshot,
  type MaterialViewId,
} from "@/lib/materials/types";
import { useCompactLayout } from "@/hooks/use-compact-layout";

const VIEW_LABEL: Record<MaterialViewId, string> = {
  requirements: "Requirements",
  shortages: "Shortages",
  procurement: "Procurement attention",
};

export function MaterialsWorkspace({ data }: { data: MaterialsSnapshot }) {
  const { simple } = useLayoutMode();
  if (simple) return <MaterialsWorkspaceSimple data={data} />;
  return <MaterialsWorkspaceFull data={data} />;
}

function MaterialsWorkspaceFull({ data }: { data: MaterialsSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("material"));
  const [sortKey, setSortKey] = useState<"material" | "required" | "projected" | "due" | "risk" | "priority">("priority");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const compact = useCompactLayout();
  const selected = data.materials.find((row) => row.productId === selectedId) ?? null;

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const activeFilters = ["risk", "order", "q"].filter((key) => searchParams.get(key)).length;

  const sorted = useMemo(() => {
    const rows = [...data.materials];
    const rank: Record<MaterialRisk, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, OK: 0 };
    const priorityRank: Record<MaterialPriorityLevel, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    rows.sort((a, b) => {
      if (sortKey === "material") return a.sku.localeCompare(b.sku);
      if (sortKey === "required") return b.grossRequirement - a.grossRequirement;
      if (sortKey === "projected") return a.projectedAvailable - b.projectedAvailable;
      if (sortKey === "due") return (a.earliestDueDate ?? "9999").localeCompare(b.earliestDueDate ?? "9999");
      if (sortKey === "risk") return rank[b.risk] - rank[a.risk];
      return priorityRank[b.priorityLevel] - priorityRank[a.priorityLevel] || rank[b.risk] - rank[a.risk];
    });
    return rows;
  }, [data.materials, sortKey]);

  const horizonRows = useMemo(
    () =>
      data.shortageHorizon.map((row) => ({
        id: row.id,
        label: row.label,
        value: row.value,
        hint: row.hint,
        href: href({ material: row.id }),
        tone: "danger" as const,
      })),
    [data.shortageHorizon, searchParams]
  );

  const productionImpact = useMemo(() => {
    const map = new Map<string, { orderNumber: string; productName: string; materials: number; priority: MaterialPriorityLevel }>();
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

  const filters = (
    <>
      <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
        <span className="shrink-0 text-muted-foreground">Risk</span>
        <select
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={searchParams.get("risk") ?? ""}
          onChange={(event) => router.push(href({ risk: event.target.value || undefined }))}
        >
          <option value="">All</option>
          {MATERIAL_RISKS.map((risk) => (
            <option key={risk} value={risk}>
              {risk}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
        <span className="shrink-0 text-muted-foreground">Production order</span>
        <select
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={searchParams.get("order") ?? ""}
          onChange={(event) => router.push(href({ order: event.target.value || undefined }))}
        >
          <option value="">All orders</option>
          {data.orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.orderNumber} · {order.productName}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ProcessTrail
        steps={[
          { id: "requirement", label: "Requirement" },
          { id: "available", label: "Available" },
          { id: "incoming", label: "Incoming" },
          { id: "projected", label: "Projected" },
          { id: "shortage", label: "Shortage" },
          { id: "production", label: "Affected production", href: "/operations" },
        ]}
        current={data.view === "shortages" || data.view === "procurement" ? "shortage" : "requirement"}
      />
      {data.bomCycles.length > 0 ? (
        <p className="work-surface px-3 py-2 text-sm text-warning" role="status">
          Circular bill of material on {data.bomCycles.map((row) => row.orderNumber).join(", ")}. Demand for those orders was not calculated.
        </p>
      ) : null}
      <div className="flex min-w-0 flex-col gap-3 work-surface p-3">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Material views" className="flex min-w-0 flex-wrap gap-1">
            {MATERIAL_VIEWS.map((view) => (
              <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-7">
                <Link href={href({ view })}>{VIEW_LABEL[view]}</Link>
              </Button>
            ))}
          </nav>
          <p className="text-xs text-muted-foreground">{data.materials.length} materials in scope</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <div className="hidden min-w-0 flex-wrap gap-2 lg:flex">{filters}</div>
          <Button type="button" size="sm" variant="outline" className="min-h-11 lg:hidden" onClick={() => setFiltersOpen(true)}>
            Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </Button>
          <SearchInput
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Material code or name"
            aria-label="Search materials"
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

      <section aria-label="Material metrics" className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="min-w-[9.5rem] shrink-0 border-r border-border px-3.5 py-3 last:border-r-0 xl:min-w-0">
            <p className="min-w-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </section>

      {horizonRows.length > 0 || data.materials.some((row) => row.grossRequirement > 0) ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {horizonRows.length > 0 ? (
            <div className="min-w-0 work-surface p-3">
              <HorizontalBarChart
                title="Shortage horizon"
                description="Earliest material pressure by net requirement — deterministic from open production demand."
                rows={horizonRows}
                embedded
              />
            </div>
          ) : null}
          <GroupedBarChart
            title="Requirement vs available"
            description="Gross BOM requirement against on-hand available — Phase 32 MRP facts."
            rows={buildMaterialBalanceRows(
              data.materials.map((row) => ({
                id: row.productId,
                title: row.name,
                requirement: row.grossRequirement,
                available: row.available,
                incoming: row.incoming,
                projected: row.projectedAvailable,
                netRequirement: row.netRequirement,
                href: `/materials?q=${encodeURIComponent(row.sku)}`,
              }))
            )}
            primaryLabel="Required"
            secondaryLabel="Available"
            note="Incoming and projected remain in the materials table and inspection sheet."
            emptyMessage="No BOM requirements in scope."
          />
        </div>
      ) : null}

      {productionImpact.length > 0 ? (
        <section aria-label="Production impact" className="min-w-0 work-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Production impact</p>
              <p className="text-xs text-muted-foreground">Orders at risk from material shortages or projected pressure.</p>
            </div>
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
              <Link href="/operations">Open Operations planner</Link>
            </Button>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {productionImpact.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{row.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">{row.productName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{row.materials} materials</span>
                  <StatusBadge tone={priorityTone[row.priority]}>{row.priority}</StatusBadge>
                  <Link href={`/operations?order=${row.id}`} className="text-xs hover:underline">
                    Inspect
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.view === "shortages" ? (
        <p className="text-sm text-muted-foreground">What could stop production — confirmed shortages after current stock and open inbound receipts.</p>
      ) : null}
      {data.view === "procurement" ? (
        <p className="text-sm text-muted-foreground">Procurement attention required. Pharmora does not create purchase orders automatically in this phase.</p>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState
          title={data.emptyReason ? "No material requirements to show" : "No rows"}
          description={data.emptyReason ?? "Adjust filters or add BOM and production order data."}
        />
      ) : (
        <div className="min-w-0 overflow-hidden work-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[68rem] text-sm" aria-label="Material risk and shortage table">
              <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                <tr>
                  <SortHead label="Material" active={sortKey === "material"} onClick={() => setSortKey("material")} />
                  <SortHead label="Priority" active={sortKey === "priority"} onClick={() => setSortKey("priority")} />
                  <SortHead label="Required" active={sortKey === "required"} onClick={() => setSortKey("required")} right />
                  <th className="px-3 py-2 text-right font-medium">On hand</th>
                  <th className="px-3 py-2 text-right font-medium">Allocated</th>
                  <th className="px-3 py-2 text-right font-medium">Incoming</th>
                  <SortHead label="Projected" active={sortKey === "projected"} onClick={() => setSortKey("projected")} right />
                  <th className="px-3 py-2 text-right font-medium">Net req.</th>
                  <th className="px-3 py-2 font-medium">Shortage</th>
                  <th className="px-3 py-2 font-medium">Affected</th>
                  <SortHead label="Earliest due" active={sortKey === "due"} onClick={() => setSortKey("due")} />
                  <SortHead label="Risk" active={sortKey === "risk"} onClick={() => setSortKey("risk")} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.productId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Inspect ${row.name}`}
                        onClick={() => setSelectedId(row.productId)}
                      >
                        <span className="block font-medium">{row.name}</span>
                        <span className="text-xs text-muted-foreground">{row.sku}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={priorityTone[row.priorityLevel]}>{row.priorityLevel}</StatusBadge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(row.grossRequirement)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(row.onHand)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(row.allocated)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(row.incoming)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(row.projectedAvailable)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(row.netRequirement)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={shortageTone[row.shortageStatus]}>{shortageLabel[row.shortageStatus]}</StatusBadge>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.affectedOrders.length}</td>
                    <td className="px-3 py-2">{formatDay(row.earliestDueDate)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={riskTone[row.risk]}>{row.risk}</StatusBadge>
                    </td>
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
            <SheetDescription>Narrow material requirements.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">{filters}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-lg"}
        >
          {selected ? <MaterialInspectSheet row={selected} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SortHead({
  label,
  active,
  onClick,
  right,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  right?: boolean;
}) {
  return (
    <th className={right ? "px-3 py-2 text-right font-medium" : "px-3 py-2 font-medium"}>
      <button type="button" onClick={onClick} className={active ? "text-foreground" : "hover:text-foreground"}>
        {label}
      </button>
    </th>
  );
}
