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
import {
  MATERIAL_RISKS,
  MATERIAL_VIEWS,
  type MaterialPriorityLevel,
  type MaterialRequirement,
  type MaterialRisk,
  type MaterialsSnapshot,
  type MaterialViewId,
  type ShortageStatus,
} from "@/lib/materials/types";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<MaterialViewId, string> = {
  requirements: "Requirements",
  shortages: "Shortages",
  procurement: "Procurement attention",
};

const riskTone: Record<MaterialRisk, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "warning",
  OK: "success",
};

const priorityTone: Record<MaterialPriorityLevel, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

const shortageTone: Record<ShortageStatus, StatusTone> = {
  SHORTAGE: "danger",
  AT_RISK: "warning",
  NO_SHORTAGE: "success",
  UNKNOWN: "neutral",
};

const statusLabel: Record<MaterialRequirement["status"], string> = {
  SHORTAGE: "Shortage",
  INCOMING_COVERS: "Incoming covers",
  TIGHT: "Tight",
  COVERED: "Covered",
};

const shortageLabel: Record<ShortageStatus, string> = {
  SHORTAGE: "Shortage",
  AT_RISK: "At risk",
  NO_SHORTAGE: "No shortage",
  UNKNOWN: "Unknown",
};

function formatQty(value: number): string {
  return value.toLocaleString("en-KE", { maximumFractionDigits: 3 });
}

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function MaterialsWorkspace({ data }: { data: MaterialsSnapshot }) {
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
          {selected ? <MaterialDetail row={selected} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function priorityRank(level: MaterialPriorityLevel): number {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[level];
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

function MaterialDetail({ row }: { row: MaterialRequirement }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{row.name}</SheetTitle>
        <SheetDescription>
          {row.sku} · {row.unit}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6 text-sm">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={priorityTone[row.priorityLevel]}>{row.priorityLevel}</StatusBadge>
          <StatusBadge tone={riskTone[row.risk]}>{row.risk}</StatusBadge>
          <StatusBadge tone={shortageTone[row.shortageStatus]}>{shortageLabel[row.shortageStatus]}</StatusBadge>
          <StatusBadge tone={row.shortage ? "danger" : "neutral"}>{statusLabel[row.status]}</StatusBadge>
        </div>
        <p className="text-xs text-muted-foreground">{row.priorityReason}</p>
        {row.attention ? <p className="text-warning">{row.attention}</p> : null}

        <section aria-label="MRP calculation">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Requirement breakdown</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="Gross requirement" value={`${formatQty(row.grossRequirement)} ${row.unit}`} />
            <Metric label="On hand" value={`${formatQty(row.onHand)} ${row.unit}`} />
            <Metric label="Allocated" value={`${formatQty(row.allocated)} ${row.unit}`} />
            <Metric label="Free available" value={`${formatQty(row.freeAvailable)} ${row.unit}`} />
            <Metric label="Incoming" value={`${formatQty(row.incoming)} ${row.unit}`} />
            <Metric label="Projected available" value={`${formatQty(row.projectedAvailable)} ${row.unit}`} />
            <Metric label="Net requirement" value={`${formatQty(row.netRequirement)} ${row.unit}`} />
            <Metric label="Shortage quantity" value={row.shortage ? formatQty(row.netRequirement) : "None"} />
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Net requirement = max(gross − on hand − incoming, 0). Projected available = on hand + incoming − gross.
            Allocated equals open production demand — there is no separate reservation ledger. Free available = on hand − allocated.
          </p>
        </section>

        <section className="border-t border-border pt-3" aria-label="Shortage timing">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Shortage</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="Status" value={shortageLabel[row.shortageStatus]} />
            <Metric label="Earliest shortage" value={formatDay(row.earliestShortageDate)} />
            <Metric label="Requirement date" value={formatDay(row.requirementDate)} />
            <Metric label="Earliest order due" value={formatDay(row.earliestDueDate)} />
          </dl>
        </section>

        {(row.risk === "CRITICAL" || row.risk === "HIGH" || row.risk === "MEDIUM" || row.shortage) && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
              <Link href={row.procurement.hrefProcurement}>Procurement planning</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
              <Link href={row.procurement.hrefRfqs}>Procurement RFQs</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
              <Link href={row.procurement.hrefPurchaseOrders}>Purchase orders</Link>
            </Button>
          </div>
        )}

        <section className="border-t border-border pt-3" aria-label="Procurement linkage">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Procurement records</p>
          <dl className="mt-2 grid grid-cols-3 gap-3">
            <Metric label="Requisitions" value={String(row.procurement.openRequisitions)} />
            <Metric label="Open RFQs" value={String(row.procurement.openRfqs)} />
            <Metric label="Open POs" value={String(row.procurement.openPurchaseOrders)} />
          </dl>
        </section>

        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Affected production orders</p>
          {row.affectedOrders.length === 0 ? (
            <p className="mt-2 text-muted-foreground">None</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {row.affectedOrders.map((order) => (
                <li key={order.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">{order.productName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Required {formatQty(order.requiredQuantity)} · due {formatDay(order.dueDate)} · {order.priority.toLowerCase()}
                  </p>
                  <Link href={`/operations?order=${order.id}`} className="mt-1 inline-block text-xs hover:underline">
                    View in Operations planner
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {row.bomPaths.length > 0 ? (
          <section className="border-t border-border pt-3" aria-label="BOM explosion">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">BOM paths</p>
            <ul className="mt-2 space-y-1.5 text-xs">
              {row.bomPaths.map((path) => (
                <li key={path.pathProductIds.join(">")} className="rounded-sm border border-border px-2 py-1.5">
                  {path.pathSkus.join(" → ")}
                  <span className="text-muted-foreground"> · qty/order {formatQty(path.quantityPer)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {row.demandSources.length > 0 ? (
          <section className="border-t border-border pt-3" aria-label="Demand sources">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Demand sources</p>
            <ul className="mt-2 space-y-1.5 text-xs">
              {row.demandSources.map((source) => (
                <li key={source.productionOrderId} className="flex justify-between gap-2">
                  <span>
                    {source.orderNumber} · {source.productName}
                  </span>
                  <span className="tabular-nums">{formatQty(source.requiredQuantity)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Existing batches</p>
          {row.lots.length === 0 ? (
            <p className="mt-2 text-muted-foreground">No inventory lots recorded for this material.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {row.lots.map((lot) => (
                <li key={lot.batchCode} className="flex justify-between gap-2 text-xs">
                  <span>
                    {lot.batchCode}
                    <span className="text-muted-foreground"> · {lot.warehouseName}</span>
                    {!lot.usable ? <span className="text-danger"> · expired</span> : null}
                  </span>
                  <span className="tabular-nums">{formatQty(lot.quantity)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          <Metric label="Safety stock" value={formatQty(row.safetyStock)} />
          <Metric label="Lead time" value={row.leadTime} />
          <Metric label="Purchase price" value={row.purchasePrice} />
          <Metric label="Reorder point" value={row.reorderPoint} />
        </dl>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
