"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/ds/empty-state";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { StackedPercentBar } from "@/components/charts/StackedPercentBar";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { buildInventoryHealthSegments } from "@/lib/analytics/inventory";
import { INVENTORY_VIEWS, type InventoryItem, type InventorySnapshot, type InventoryViewId } from "@/lib/inventory/types";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<InventoryViewId, string> = {
  overview: "Overview",
  health: "Health",
  expiry: "Expiry",
  ageing: "Ageing",
  requirements: "Requirements",
};

const healthTone: Record<string, StatusTone> = {
  OUT_OF_STOCK: "danger",
  CRITICAL: "danger",
  LOW: "material",
  HEALTHY: "intel",
  EXPIRED: "danger",
  EXPIRING_SOON: "material",
};

function formatQty(value: number): string {
  return value.toLocaleString("en-KE");
}

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function InventoryWorkspace({ data }: { data: InventorySnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<"sku" | "onHand" | "health" | "expiry">("health");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const compact = useCompactLayout();
  const selected = data.items.find((item) => item.id === selectedId) ?? null;

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const activeFilters = ["class", "status", "q", "bucket"].filter((key) => searchParams.get(key)).length;

  const sorted = useMemo(() => {
    const rows = [...data.items];
    const rank = { OUT_OF_STOCK: 3, CRITICAL: 2, LOW: 1, HEALTHY: 0 };
    rows.sort((a, b) => {
      if (sortKey === "sku") return a.sku.localeCompare(b.sku);
      if (sortKey === "onHand") return b.onHand - a.onHand;
      if (sortKey === "expiry") return (a.daysRemaining ?? 99999) - (b.daysRemaining ?? 99999);
      return (rank[b.health] ?? 0) - (rank[a.health] ?? 0);
    });
    return rows;
  }, [data.items, sortKey]);

  const pageSize = 12;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const rows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const filters = (
    <>
      <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
        <span className="shrink-0 text-muted-foreground">Category</span>
        <select
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={searchParams.get("class") ?? ""}
          onChange={(event) => router.push(href({ class: event.target.value || undefined }))}
        >
          <option value="">All categories</option>
          {data.categories.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
        <span className="shrink-0 text-muted-foreground">Status</span>
        <select
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={searchParams.get("status") ?? ""}
          onChange={(event) => router.push(href({ status: event.target.value || undefined }))}
        >
          <option value="">All statuses</option>
          {data.health.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-3 work-surface p-3">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Inventory views" className="flex min-w-0 flex-wrap gap-1">
            {INVENTORY_VIEWS.map((view) => (
              <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-7">
                <Link href={href({ view, bucket: undefined })}>{VIEW_LABEL[view]}</Link>
              </Button>
            ))}
          </nav>
          <p className="text-xs text-muted-foreground">{data.items.length} items in scope</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <div className="hidden min-w-0 flex-wrap gap-2 lg:flex">{filters}</div>
          <Button type="button" size="sm" variant="outline" className="min-h-11 lg:hidden" onClick={() => setFiltersOpen(true)}>
            Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </Button>
          <SearchInput
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Code, name, batch"
            aria-label="Search inventory"
            className="md:max-w-56 [&_input]:h-11 md:[&_input]:h-8"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                router.push(href({ q: event.currentTarget.value || undefined }));
              }
            }}
          />
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
            <Link href={`${pathname}?view=${data.view}`}>Clear all</Link>
          </Button>
        </div>
      </div>

      <section aria-label="Inventory findings" className="work-surface p-4">
        <h2 className="text-sm font-semibold tracking-tight">What needs attention</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          {data.findings.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-label="Inventory metrics" className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-6 xl:overflow-visible">
        {data.kpis.map((kpi) => (
          <Link
            key={kpi.id}
            href={kpi.href}
            className="min-w-[9.5rem] shrink-0 border-r border-border px-3.5 py-3 last:border-r-0 transition duration-150 hover:bg-muted/40 xl:min-w-0"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
              <StatusBadge tone={healthTone[kpi.risk] ?? "neutral"}>{kpi.risk.replace(/_/g, " ")}</StatusBadge>
            </div>
            <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </Link>
        ))}
      </section>

      {data.view === "overview" || data.view === "health" ? (
        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
          <StackedPercentBar
            title="Inventory health"
            description="On-hand quantity by stock health — deterministic from safety stock and expiry exposure."
            segments={buildInventoryHealthSegments({
              health: data.health,
              expiringSoonQty: data.expiringSoonQty,
            })}
            emptyMessage="No inventory health quantities in scope."
          />
          <HorizontalBarChart
            title="By category"
            description="Quantity by product class."
            rows={data.categories.map((row) => ({
              id: row.id,
              label: row.label,
              value: row.quantity,
              hint: `${row.items} items · ${row.low + row.critical} needing attention`,
              href: href({ class: row.id }),
              tone: row.low + row.critical > 0 ? ("material" as const) : ("intel" as const),
            }))}
            emptyMessage="No category quantities in scope."
          />
        </div>
      ) : null}

      {data.view === "expiry" ? <BucketPanel title="Expiry" rows={data.expiryBuckets} href={href} empty="No dated batches in scope." /> : null}
      {data.view === "ageing" ? <BucketPanel title="Ageing" rows={data.ageingBuckets} href={href} heatmap empty="No received dates in scope." /> : null}

      {data.view === "expiry" ? (
        <p className="text-sm text-muted-foreground">
          {formatQty(data.expiredQty)} expired · {formatQty(data.expiringSoonQty)} expiring soon · {data.expiredShare}% of on-hand quantity · {data.expiredItems} items · {data.expiredBatches} batches
        </p>
      ) : null}

      {data.view === "requirements" ? <RequirementsTable items={sorted} onOpen={setSelectedId} /> : null}
      {data.view === "expiry" ? <BatchTable items={sorted} mode="expiry" onOpen={setSelectedId} /> : null}
      {data.view === "ageing" ? <BatchTable items={sorted} mode="ageing" onOpen={setSelectedId} /> : null}
      {data.view === "overview" || data.view === "health" ? (
        <ItemTable
          rows={rows}
          total={sorted.length}
          page={safePage}
          pages={pages}
          setPage={setPage}
          sortKey={sortKey}
          setSortKey={(key) => {
            setSortKey(key);
            setPage(0);
          }}
          onOpen={setSelectedId}
        />
      ) : null}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:max-w-none">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>{activeFilters} active</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">{filters}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={selectedId !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-md"}
        >
          {selected ? <ItemDetail item={selected} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BucketPanel({
  title,
  rows,
  href,
  heatmap = false,
  empty,
}: {
  title: string;
  rows: InventorySnapshot["expiryBuckets"];
  href: (patch: Record<string, string | undefined>) => string;
  heatmap?: boolean;
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.quantity));
  if (rows.every((row) => row.quantity === 0)) return <EmptyState title={empty} description="Expiry and ageing use actual batch dates only." />;
  return (
    <section className="min-w-0 overflow-hidden work-surface">
      <h2 className="px-4 py-3 text-sm font-semibold tracking-tight">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="sticky top-0 bg-card text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Bucket</th>
              <th className="px-4 py-2 text-right font-medium">Quantity</th>
              <th className="px-4 py-2 text-right font-medium">Share</th>
              <th className="px-4 py-2 font-medium">Batches</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-2">
                  <Link href={href({ bucket: row.id })} className="font-medium hover:underline">
                    {row.label}
                  </Link>
                  {heatmap ? (
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full bg-primary" style={{ width: `${(row.quantity / max) * 100}%` }} />
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(row.quantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.share}%</td>
                <td className="px-4 py-2 tabular-nums">{row.items}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ItemTable({
  rows,
  total,
  page,
  pages,
  setPage,
  sortKey,
  setSortKey,
  onOpen,
}: {
  rows: InventoryItem[];
  total: number;
  page: number;
  pages: number;
  setPage: (page: number) => void;
  sortKey: "sku" | "onHand" | "health" | "expiry";
  setSortKey: (key: "sku" | "onHand" | "health" | "expiry") => void;
  onOpen: (id: string) => void;
}) {
  if (total === 0) return <EmptyState title="No inventory items" description="No items match the current filters." />;
  return (
    <section className="min-w-0 overflow-hidden work-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="sticky top-0 bg-card text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">
                <button type="button" className="hover:underline" onClick={() => setSortKey("sku")}>
                  Item{sortKey === "sku" ? " ↓" : ""}
                </button>
              </th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 text-right font-medium">
                <button type="button" className="hover:underline" onClick={() => setSortKey("onHand")}>
                  Qty{sortKey === "onHand" ? " ↓" : ""}
                </button>
              </th>
              <th className="px-4 py-2 font-medium">Unit</th>
              <th className="px-4 py-2 text-right font-medium">Safety</th>
              <th className="px-4 py-2 text-right font-medium">Available</th>
              <th className="px-4 py-2 text-right font-medium">In transit</th>
              <th className="px-4 py-2 font-medium">
                <button type="button" className="hover:underline" onClick={() => setSortKey("health")}>
                  Status{sortKey === "health" ? " ↓" : ""}
                </button>
              </th>
              <th className="px-4 py-2 font-medium">
                <button type="button" className="hover:underline" onClick={() => setSortKey("expiry")}>
                  Nearest expiry{sortKey === "expiry" ? " ↓" : ""}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-2">
                  <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(item.id)}>
                    {item.name}
                  </button>
                  <p className="text-xs text-muted-foreground">{item.sku}</p>
                </td>
                <td className="px-4 py-2">{item.classId.replace(/_/g, " ").toLowerCase()}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(item.onHand)}</td>
                <td className="px-4 py-2">{item.unit}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(item.safetyStock)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(item.available)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(item.inTransit)}</td>
                <td className="px-4 py-2">
                  <StatusBadge tone={healthTone[item.health]}>{item.health.replace(/_/g, " ")}</StatusBadge>
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {item.daysRemaining === null ? "—" : item.daysRemaining < 0 ? `${Math.abs(item.daysRemaining)}d overdue` : `${item.daysRemaining}d`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <p>
          {total} item{total === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}

function RequirementsTable({ items, onOpen }: { items: InventoryItem[]; onOpen: (id: string) => void }) {
  if (items.length === 0) return <EmptyState title="No requirement rows" description="No items match the current filters." />;
  return (
    <section className="min-w-0 overflow-hidden work-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="sticky top-0 bg-card text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 text-right font-medium">Required</th>
              <th className="px-4 py-2 text-right font-medium">On hand</th>
              <th className="px-4 py-2 text-right font-medium">In transit</th>
              <th className="px-4 py-2 text-right font-medium">Projected</th>
              <th className="px-4 py-2 text-right font-medium">Shortfall</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-2">
                  <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(item.id)}>
                    {item.name}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {item.sku}
                    {item.hasBom ? " · production need included" : " · safety stock target"}
                  </p>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(item.required)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(item.onHand)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(item.inTransit)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(item.projected)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(item.shortfall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BatchTable({ items, mode, onOpen }: { items: InventoryItem[]; mode: "expiry" | "ageing"; onOpen: (id: string) => void }) {
  const batches = items.flatMap((item) => item.batches.map((batch) => ({ item, batch })));
  if (batches.length === 0) return <EmptyState title="No batches" description="No batch rows match the current filters." />;
  return (
    <section className="min-w-0 overflow-hidden work-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="sticky top-0 bg-card text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 font-medium">Batch</th>
              <th className="px-4 py-2 text-right font-medium">Qty</th>
              <th className="px-4 py-2 font-medium">{mode === "expiry" ? "Expiry" : "Received"}</th>
              <th className="px-4 py-2 font-medium">{mode === "expiry" ? "Days remaining" : "Age"}</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {batches.map(({ item, batch }) => (
              <tr key={batch.id} className="border-t border-border">
                <td className="px-4 py-2">
                  <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(item.id)}>
                    {item.name}
                  </button>
                </td>
                <td className="px-4 py-2">{batch.batchCode}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(batch.quantity)}</td>
                <td className="px-4 py-2 tabular-nums">{formatDay(mode === "expiry" ? batch.expiryDate : batch.receivedAt)}</td>
                <td className="px-4 py-2 tabular-nums">
                  {mode === "expiry"
                    ? batch.daysRemaining === null
                      ? "—"
                      : batch.daysRemaining < 0
                        ? `${Math.abs(batch.daysRemaining)}d overdue`
                        : `${batch.daysRemaining}d`
                    : `${batch.ageDays}d`}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge tone={healthTone[mode === "expiry" ? (batch.expiryStatus ?? "HEALTHY") : item.health]}>
                    {mode === "expiry" ? (batch.expiryStatus ?? "Not dated").replace(/_/g, " ") : item.health.replace(/_/g, " ")}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ItemDetail({ item }: { item: InventoryItem }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{item.name}</SheetTitle>
        <SheetDescription>
          {item.sku} · {item.classId.replace(/_/g, " ").toLowerCase()}
        </SheetDescription>
      </SheetHeader>
      <dl className="grid grid-cols-2 gap-3 px-4 text-sm">
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">On hand</dt>
          <dd className="mt-0.5 tabular-nums">
            {formatQty(item.onHand)} {item.unit}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Safety stock</dt>
          <dd className="mt-0.5 tabular-nums">{formatQty(item.safetyStock)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">In transit</dt>
          <dd className="mt-0.5 tabular-nums">{formatQty(item.inTransit)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Status</dt>
          <dd className="mt-0.5">
            <StatusBadge tone={healthTone[item.health]}>{item.health.replace(/_/g, " ")}</StatusBadge>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Nearest expiry</dt>
          <dd className="mt-0.5">{formatDay(item.nearestExpiry)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Projected</dt>
          <dd className="mt-0.5 tabular-nums">{formatQty(item.projected)}</dd>
        </div>
      </dl>
      <div className="px-4 pb-6">
        <h3 className="mt-4 text-sm font-semibold tracking-tight">Batches</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {item.batches.map((batch) => (
            <li key={batch.id} className="text-muted-foreground">
              {batch.batchCode} · {formatQty(batch.quantity)} · {batch.warehouseName}
              {batch.expiryDate ? ` · exp ${formatDay(batch.expiryDate)}` : ""}
            </li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-semibold tracking-tight">Production</h3>
        {item.orders.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Production linkage unavailable</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {item.orders.map((order) => (
              <li key={order.id}>
                <Link href="/operations" className="hover:underline">
                  {order.orderNumber}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatQty(order.quantity)} · {order.status.replace(/_/g, " ")}
                  {order.workstationName ? ` · ${order.workstationName}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button asChild size="sm" variant="outline" className="mt-4 min-h-11 sm:min-h-7">
          <Link href="/reports?view=inventory">Open in Reports</Link>
        </Button>
      </div>
    </>
  );
}
