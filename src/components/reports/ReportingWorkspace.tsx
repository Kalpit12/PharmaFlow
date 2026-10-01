"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { LineComboChart } from "@/components/charts/LineComboChart";
import { StackedPercentBar } from "@/components/charts/StackedPercentBar";
import { GroupedBarChart } from "@/components/charts/GroupedBarChart";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { IntelligenceSurface } from "@/components/intelligence/IntelligenceSurface";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { StructuredAIResponse } from "@/lib/ai/response";
import { REPORT_PRIMARY_VIEWS, REPORT_VIEWS, type InboundReceiptRow, type ProductionOrderRow, type ReportLot, type ReportingSnapshot, type ReportViewId } from "@/lib/reports/types";
import { downloadReportsExcel } from "@/lib/reports/export";
import { metricCatalogByDomain } from "@/lib/reports/metric-catalog";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<ReportViewId, string> = {
  executive: "Executive",
  sales: "Sales",
  operations: "Operations",
  inventory: "Inventory",
  procurement: "Procurement",
  suppliers: "Suppliers",
  overview: "Overview",
  health: "Health",
  expiry: "Expiry",
  ageing: "Ageing",
  production: "Production",
  materials: "Materials",
  "finished-goods": "Finished goods",
  "raw-materials": "Raw materials",
  packaging: "Packaging",
};

const LEGACY_VIEWS: ReportViewId[] = [
  "overview",
  "health",
  "expiry",
  "ageing",
  "production",
  "materials",
  "finished-goods",
  "raw-materials",
  "packaging",
];

const CLASS_VIEWS: ReportViewId[] = ["finished-goods", "raw-materials", "packaging"];

const riskTone: Record<string, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "material",
  MEDIUM: "material",
  LOW: "info",
  HEALTHY: "intel",
  OK: "intel",
};

const LOT_PAGE_SIZES = [25, 50, 100, 250] as const;
type LotPageSize = (typeof LOT_PAGE_SIZES)[number];

function parseLotPageSize(value: string | null): LotPageSize {
  const n = Number(value);
  return (LOT_PAGE_SIZES as readonly number[]).includes(n) ? (n as LotPageSize) : 50;
}

type SortKey = "product" | "quantity" | "value" | "age" | "expiry" | "risk";

const RISK_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, HEALTHY: 0 };

function formatQty(value: number): string {
  return value.toLocaleString("en-KE");
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function lotRisk(lot: ReportLot): string {
  return lot.expiryRisk ?? lot.ageingRisk;
}

export function ReportingWorkspace({ data }: { data: ReportingSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const compact = useCompactLayout();
  const selected = data.lots.find((lot) => lot.id === selectedId) ?? null;
  const selectedOrder = data.production.orders.find((order) => order.id === selectedOrderId) ?? null;

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const sortedLots = useMemo(() => {
    const rows = [...data.lots];
    rows.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "product") return a.productName.localeCompare(b.productName) * dir;
      if (sortKey === "quantity") return (a.quantity - b.quantity) * dir;
      if (sortKey === "value") return (a.valueAmount - b.valueAmount) * dir;
      if (sortKey === "age") return (a.ageDays - b.ageDays) * dir;
      if (sortKey === "expiry") return ((a.daysRemaining ?? 99999) - (b.daysRemaining ?? 99999)) * dir;
      return ((RISK_RANK[lotRisk(a)] ?? 0) - (RISK_RANK[lotRisk(b)] ?? 0)) * dir;
    });
    return rows;
  }, [data.lots, sortDir, sortKey]);

  const pageSize = parseLotPageSize(searchParams.get("pageSize"));
  const pages = Math.max(1, Math.ceil(sortedLots.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const rows = sortedLots.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "product" ? "asc" : "desc");
    }
    setPage(0);
  };

  const showProductionFilters = data.view === "production" || data.view === "operations";
  const navViews: ReportViewId[] = (REPORT_PRIMARY_VIEWS as readonly ReportViewId[]).includes(data.view)
    ? [...REPORT_PRIMARY_VIEWS]
    : [...REPORT_PRIMARY_VIEWS, data.view];
  const activeFilters = ["warehouse", "category", "supplier", "workstation", "status", "from", "to", "q"].filter((key) =>
    searchParams.get(key)
  ).length;

  const filterControls = (
    <>
      <FilterSelect
        label="Warehouse"
        value={searchParams.get("warehouse") ?? ""}
        onChange={(value) => router.push(href({ warehouse: value }))}
        options={data.warehouses.map((row) => ({ id: row.id, label: row.name }))}
        empty="All warehouses"
      />
      <FilterSelect
        label="Category"
        value={searchParams.get("category") ?? ""}
        onChange={(value) => router.push(href({ category: value }))}
        options={data.categories.map((row) => ({ id: row, label: row }))}
        empty="All categories"
      />
      {data.suppliers.length > 0 ? (
        <FilterSelect
          label="Supplier"
          value={searchParams.get("supplier") ?? ""}
          onChange={(value) => router.push(href({ supplier: value }))}
          options={data.suppliers.map((row) => ({ id: row.id, label: row.name }))}
          empty="All suppliers"
        />
      ) : null}
      {showProductionFilters ? (
        <>
          <FilterSelect
            label="Line"
            value={searchParams.get("workstation") ?? ""}
            onChange={(value) => router.push(href({ workstation: value }))}
            options={data.production.workstations.map((row) => ({ id: row.id, label: row.name }))}
            empty="All lines"
          />
          <FilterSelect
            label="Status"
            value={searchParams.get("status") ?? ""}
            onChange={(value) => router.push(href({ status: value }))}
            options={data.production.statuses.map((row) => ({ id: row.id, label: row.label }))}
            empty="All statuses"
          />
        </>
      ) : null}
      <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
        <span className="shrink-0 text-muted-foreground">History from</span>
        <input
          type="date"
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={searchParams.get("from") ?? ""}
          onChange={(event) => router.push(href({ from: event.target.value || undefined }))}
          title="Scopes weekly snapshots and current lots by received date"
        />
      </label>
      <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
        <span className="shrink-0 text-muted-foreground">History to</span>
        <input
          type="date"
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={searchParams.get("to") ?? ""}
          onChange={(event) => router.push(href({ to: event.target.value || undefined }))}
          title="Scopes weekly snapshots and current lots by received date"
        />
      </label>
    </>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-3 work-surface p-3">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex min-w-0 items-center gap-2 text-xs font-medium lg:hidden">
            <span className="text-muted-foreground">Report</span>
            <select
              className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={data.view}
              onChange={(event) => router.push(href({ view: event.target.value, bucket: undefined }))}
            >
              {REPORT_VIEWS.map((view) => (
                <option key={view} value={view}>
                  {VIEW_LABEL[view]}
                </option>
              ))}
            </select>
          </label>
          <nav aria-label="Reports" className="hidden min-w-0 flex-wrap gap-1 lg:flex">
            {navViews.map((view) => (
              <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-7">
                <Link href={href({ view, bucket: undefined })}>{VIEW_LABEL[view]}</Link>
              </Button>
            ))}
            <label className="flex min-w-0 items-center gap-1 text-xs font-medium">
              <span className="sr-only">More reports</span>
              <select
                className="h-11 min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm md:h-8"
                value={LEGACY_VIEWS.includes(data.view) ? data.view : ""}
                onChange={(event) => {
                  if (event.target.value) router.push(href({ view: event.target.value, bucket: undefined }));
                }}
                aria-label="More reports"
              >
                <option value="">More</option>
                {LEGACY_VIEWS.map((view) => (
                  <option key={view} value={view}>
                    {VIEW_LABEL[view]}
                  </option>
                ))}
              </select>
            </label>
          </nav>
          <p className="text-xs text-muted-foreground">Refreshed {formatStamp(data.generatedAt)} UTC</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <div className="hidden min-w-0 flex-wrap gap-2 lg:flex">{filterControls}</div>
          <Button type="button" size="sm" variant="outline" className="min-h-11 lg:hidden" onClick={() => setFiltersOpen(true)}>
            Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </Button>
          <SearchInput
            defaultValue={searchParams.get("q") ?? ""}
            placeholder={data.view === "sales" ? "Region, product, customer" : "Item, SKU, batch, supplier"}
            aria-label="Search reports"
            className="md:max-w-56 [&_input]:h-11 md:[&_input]:h-8"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                router.push(href({ q: event.currentTarget.value || undefined }));
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-7"
            onClick={() => downloadReportsExcel(data)}
          >
            Export Excel
          </Button>
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
            <Link href={`${pathname}?view=${data.view}`}>Reset</Link>
          </Button>
        </div>
      </div>

      <ExplainReport view={data.view} />
      <AnalystMetricCatalog />

      <section aria-label="Key findings" className="work-surface p-4">
        <h2 className="text-sm font-semibold tracking-tight">Key findings</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {data.findings.map((item) => (
            <li key={item} className="text-muted-foreground">
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{data.historyNote}</p>
      </section>

      {data.view === "executive" ? <KpiStrip kpis={data.executiveKpis} notes={data.metricNotes} /> : null}
      {(data.view === "overview" || data.view === "inventory" || data.view === "health" || CLASS_VIEWS.includes(data.view)) ? (
        <KpiStrip kpis={data.kpis} notes={data.metricNotes} />
      ) : null}

      {data.view === "executive" ? <ExecutiveReport data={data} href={href} /> : null}
      {data.view === "sales" ? <SalesReport data={data} /> : null}
      {data.view === "overview" ? <Overview data={data} href={href} onOpen={setSelectedId} /> : null}
      {data.view === "inventory" ? (
        <>
          <InventoryBody
            data={data}
            rows={rows}
            page={safePage}
            pages={pages}
            pageSize={pageSize}
            total={sortedLots.length}
            setPage={setPage}
            onOpen={setSelectedId}
            href={href}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
          />
          <MaterialsTeaser data={data} />
        </>
      ) : null}
      {CLASS_VIEWS.includes(data.view) ? (
        <ClassReport
          data={data}
          rows={rows}
          page={safePage}
          pages={pages}
          pageSize={pageSize}
          total={sortedLots.length}
          setPage={setPage}
          onOpen={setSelectedId}
          href={href}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
        />
      ) : null}
      {data.view === "expiry" ? <BucketReport title="Expiry exposure" rows={data.expiryBuckets} lots={data.lots} ranked={data.topExpiry} href={href} onOpen={setSelectedId} /> : null}
      {data.view === "ageing" ? <BucketReport title="Inventory ageing" rows={data.ageingBuckets} lots={data.lots} ranked={[]} href={href} onOpen={setSelectedId} heatmap /> : null}
      {data.view === "health" ? (
        <section className="work-surface p-4">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Inventory health</h2>
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
              <Link href="/inventory?view=health">Open Inventory</Link>
            </Button>
          </div>
          <BarPanel
            embedded
            title=""
            rows={data.health.map((row) => ({ id: row.id, label: row.label, value: row.count, hint: formatQty(row.quantity) }))}
            hrefFor={(id) => `/inventory?view=health&status=${id}`}
          />
        </section>
      ) : null}
      {data.view === "production" || data.view === "operations" ? (
        <ProductionReport data={data} href={href} onOpenOrder={setSelectedOrderId} />
      ) : null}
      {data.view === "materials" ? <MaterialsReport data={data} onOpen={setSelectedId} /> : null}
      {data.view === "procurement" ? <ProcurementReport data={data} /> : null}
      {data.view === "suppliers" ? <SuppliersReport data={data} /> : null}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:max-w-none">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>{activeFilters} active</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">{filterControls}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={selectedId !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-md"}
        >
          {selected ? <LotDetail lot={selected} /> : null}
        </SheetContent>
      </Sheet>

      <Sheet open={selectedOrderId !== null} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-md"}
        >
          {selectedOrder ? <ProductionOrderDetail order={selectedOrder} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ExplainReport({ view }: { view: ReportViewId }) {
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<StructuredAIResponse | null>(null);

  async function explain() {
    setLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: `Explain this report (${view}).` }),
      });
      const body = (await res.json()) as { response?: StructuredAIResponse; message?: string };
      if (!res.ok || !body.response) {
        setAiError(body.message ?? "AI explanation unavailable");
        return;
      }
      setExplanation(body.response);
    } catch {
      setAiError("AI explanation unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="work-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Metrics are deterministic. Interpretation is optional.</p>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={explain} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Explain this report
        </Button>
      </div>
      {aiError ? <p className="mt-2 text-sm text-destructive">{aiError}</p> : null}
      {explanation ? (
        <div className="mt-3 space-y-2 text-sm">
          <p>{explanation.summary}</p>
          {explanation.keySignals.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
              {explanation.keySignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Transparent measure definitions — analyst alternative to inventing DAX. */
function AnalystMetricCatalog() {
  const [open, setOpen] = useState(false);
  const groups = metricCatalogByDomain();
  return (
    <section className="work-surface p-4" aria-label="Analyst metric catalog">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Metric catalog</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Named plant measures with source and limitations — reuse these facts instead of inventing DAX.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide catalog" : "Browse measures"}
        </Button>
      </div>
      {open ? (
        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <div key={group.domain}>
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{group.domain}</p>
              <ul className="mt-2 divide-y divide-border">
                {group.metrics.map((metric) => (
                  <li key={metric.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{metric.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{metric.how}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Source: {metric.source} · {metric.limitation}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="ghost" className="min-h-11 shrink-0 sm:min-h-7">
                      <Link href={metric.href}>Open</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ManagementAttention({ items }: { items: ReportingSnapshot["managementAttention"] }) {
  return (
    <AttentionList
      title="Management Attention"
      subtitle="Deterministic signals from operations, materials, inventory, procurement, and suppliers."
      empty={
        items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">No ranked operational signals in the current snapshot.</p>
        ) : undefined
      }
    >
      {items.map((item, index) => (
        <AttentionItem
          key={item.id}
          rank={index + 1}
          domain={item.domain}
          severity={item.severity}
          issue={item.issue}
          evidence={item.evidence}
          consequence={item.impact}
          href={item.href}
          actionLabel="Inspect"
        />
      ))}
    </AttentionList>
  );
}

function OutlookAndScenarios({ data }: { data: ReportingSnapshot }) {
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-2">
      <section className="work-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Near-term Outlook</h2>
          <div className="flex gap-1">
            {[7, 14, 30].map((days) => (
              <Button key={days} asChild size="xs" variant="outline" className="min-h-11 min-w-11 sm:min-h-7">
                <Link href={`/forecast?horizon=${days}`}>{days}D</Link>
              </Button>
            ))}
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Sales</dt>
            <dd className="font-medium">{data.forecastOutlook.sales}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Production</dt>
            <dd className="font-medium">{data.forecastOutlook.production}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Materials</dt>
            <dd className="font-medium">{data.forecastOutlook.materials}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Procurement</dt>
            <dd className="font-medium">{data.forecastOutlook.procurement}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Confidence {data.forecastOutlook.confidence} · {data.forecastOutlook.horizon}. Reuses Phase 20 forecast — not recalculated here.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3 min-h-11 sm:min-h-7">
          <Link href="/forecast">Open forecast</Link>
        </Button>
      </section>
      <section className="work-surface p-4">
        <h2 className="text-sm font-semibold tracking-tight">Scenario Planning</h2>
        {data.scenarioPlanning ? (
          <>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.scenarioPlanning.baselineLabel} vs {data.scenarioPlanning.scenarioLabel}. Projected variance only — live data unchanged.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    <th className="py-2 pr-3">Metric</th>
                    <th className="py-2 pr-3">Current</th>
                    <th className="py-2 pr-3">Scenario</th>
                    <th className="py-2">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scenarioPlanning.rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-3 font-medium">{row.label}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.current}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.scenario}</td>
                      <td className="py-2 tabular-nums">{row.variance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button asChild size="sm" variant="outline" className="mt-3 min-h-11 sm:min-h-7">
              <Link href={data.scenarioPlanning.href}>Open scenarios</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              What-if analysis stays on the scenario workspace. Reports do not execute or persist scenarios.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3 min-h-11 sm:min-h-7">
              <Link href={data.scenarioHref}>Open scenarios</Link>
            </Button>
          </>
        )}
      </section>
    </div>
  );
}

function MetricNotes({ notes }: { notes: ReportingSnapshot["metricNotes"] }) {
  return (
    <section className="work-surface p-4">
      <h2 className="text-sm font-semibold tracking-tight">How calculated</h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {notes.map((note) => (
          <li key={note.id}>
            <span className="font-medium">{note.label}:</span> <span className="text-muted-foreground">{note.how}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ExecutiveReport({ data, href }: { data: ReportingSnapshot; href: (patch: Record<string, string | undefined>) => string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <LineComboChart
        dominant
        title="Revenue & Order Trend"
        description="Confirmed + fulfilled orders, last 30 days (KSh millions)."
        points={data.sales.series.map((row) => ({ label: row.label, primary: row.revenue, secondary: row.orders }))}
        emptyMessage="Not enough realized-order history to draw a trend."
      />
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <HorizontalBarChart
          title="Revenue by Product"
          description="Top products by unit volume with revenue context."
          rows={data.sales.products.map((row) => ({
            id: row.id,
            label: row.name,
            value: row.units,
            hint: row.revenue,
            href: row.href,
            tone: "primary",
          }))}
        />
        <HorizontalBarChart
          title="Revenue by Region"
          rows={data.sales.regions.map((row) => ({
            id: row.id,
            label: row.country,
            value: row.orders,
            hint: row.revenue,
            href: row.href,
            tone: "intel",
          }))}
        />
        <GroupedBarChart
          title="Production: Planned vs Actual"
          description="Open pipeline vs completed order quantity."
          rows={data.production.plannedVsActual}
          note="Produced quantity reflects completed production orders only."
          emptyMessage="No production orders in scope."
        />
        <HorizontalBarChart
          title="Workstation Capacity"
          rows={data.production.lines.map((row) => ({
            id: row.id,
            label: row.name,
            value: row.utilization,
            hint: `${row.orders} orders`,
            href: href({ view: "operations", workstation: row.id }),
            tone: row.utilization >= 95 ? "danger" : row.utilization >= 85 ? "material" : "neutral",
          }))}
          valueSuffix="%"
        />
        <StackedPercentBar
          title="Inventory Health"
          segments={data.health.map((row) => ({
            id: row.id,
            label: row.label,
            value: row.quantity,
            tone:
              row.id === "HEALTHY"
                ? "intel"
                : row.id === "LOW"
                  ? "material"
                  : row.id === "CRITICAL" || row.id === "OUT_OF_STOCK"
                    ? "danger"
                    : "neutral",
            href: `/inventory?view=health&status=${row.id}`,
          }))}
        />
        <FunnelChart title="Procurement Pipeline" stages={data.procurementPipeline} />
      </div>
      <ManagementAttention items={data.managementAttention} />
      <IntelligenceSurface
        data={data.intelligence}
        title="Cross-domain operational risk"
        subtitle="Production, material, quality, procurement, and traceability priorities from recorded facts."
      />
      <OutlookAndScenarios data={data} />
      <MetricNotes notes={data.metricNotes} />
      <SimpleTable
        title="Customer concentration"
        empty="No confirmed or fulfilled orders in the last 30 days."
        columns={["Customer", "Revenue", "Share"]}
        rows={data.sales.customers.map((row) => ({
          id: row.id,
          href: row.href,
          cells: [row.name, row.revenue, row.share],
        }))}
      />
    </div>
  );
}

function SalesReport({ data }: { data: ReportingSnapshot }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <KpiStrip
        kpis={[
          {
            id: "revenue",
            label: "Revenue",
            value: data.sales.revenue,
            hint: data.sales.priorRevenueZero ? "vs prior 30 days: —" : data.sales.revenueGrowth,
            risk: "HEALTHY",
            href: "/analytics",
            available: !data.sales.empty,
          },
          {
            id: "orders",
            label: "Order volume",
            value: String(data.sales.orders),
            hint: data.sales.ordersGrowth,
            risk: "HEALTHY",
            href: "/customers",
            available: true,
          },
          {
            id: "rfqs",
            label: "RFQ context",
            value: String(data.sales.rfqs),
            hint: "Inbound commercial RFQs in the same 30-day window",
            risk: "HEALTHY",
            href: "/rfqs",
            available: true,
          },
        ]}
        notes={data.metricNotes}
      />
      <p className="text-xs text-muted-foreground">{data.sales.definition} Growth is “—” when the prior period is zero.</p>
      <LineComboChart
        title="Revenue & Order Trend"
        description="Confirmed + fulfilled orders, last 30 days (KSh millions)."
        points={data.sales.series.map((row) => ({ label: row.label, primary: row.revenue, secondary: row.orders }))}
        emptyMessage="Not enough realized-order history to draw a trend."
        dominant
      />
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <HorizontalBarChart
          title="Revenue by Region"
          rows={data.sales.regions.map((row) => ({
            id: row.id,
            label: row.country,
            value: row.orders,
            hint: row.revenue,
            href: data.sales.regions.find((r) => r.id === row.id)?.href ?? "/reports?view=sales",
            tone: "intel",
          }))}
        />
        <HorizontalBarChart
          title="Revenue by Product"
          rows={data.sales.products.map((row) => ({
            id: row.id,
            label: row.name,
            value: row.units,
            hint: row.revenue,
            href: row.href,
            tone: "primary",
          }))}
        />
      </div>
      <SimpleTable
        title="Top customers"
        empty="No realized customer revenue in this window."
        columns={["Customer", "Revenue", "Share"]}
        rows={data.sales.customers.map((row) => ({
          id: row.id,
          href: row.href,
          cells: [row.name, row.revenue, row.share],
        }))}
      />
    </div>
  );
}

function RevenueTrend({ series }: { series: ReportingSnapshot["sales"]["series"] }) {
  return (
    <LineComboChart
      title="How is revenue changing?"
      description="Confirmed + fulfilled orders, last 30 days (KSh millions)."
      points={series.map((row) => ({ label: row.label, primary: row.revenue, secondary: row.orders }))}
      emptyMessage="Not enough realized-order history to draw a trend."
    />
  );
}

function MaterialsTeaser({ data }: { data: ReportingSnapshot }) {
  return (
    <section className="work-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Material requirements</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
            <Link href="/reports?view=materials">Materials report</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
            <Link href="/materials">Open Materials</Link>
          </Button>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {data.materialPlan.atRisk} materials with net requirement after available + incoming · {data.materialPlan.ordersAffected} production orders affected.
      </p>
    </section>
  );
}

function InventoryDeepLinks({ href }: { href: (patch: Record<string, string | undefined>) => string }) {
  const links: Array<{ label: string; view: ReportViewId }> = [
    { label: "Materials vs plan", view: "materials" },
    { label: "Finished goods", view: "finished-goods" },
    { label: "Raw materials", view: "raw-materials" },
    { label: "Packaging", view: "packaging" },
    { label: "Expiry", view: "expiry" },
    { label: "Ageing", view: "ageing" },
  ];
  return (
    <nav aria-label="Inventory report depth" className="flex min-w-0 flex-wrap gap-1">
      {links.map((link) => (
        <Button key={link.view} asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
          <Link href={href({ view: link.view, bucket: undefined })}>{link.label}</Link>
        </Button>
      ))}
    </nav>
  );
}

function InboundReceiptsPanel({ rows }: { rows: InboundReceiptRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  return (
    <section className="min-w-0 overflow-hidden work-surface" aria-label="Open inbound receipts">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Open inbound</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rows.length === 0
              ? "No open receipts — shortages are on-hand only."
              : `${rows.length} open receipt${rows.length === 1 ? "" : "s"} · ${formatQty(total)} units expected · not yet on hand`}
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
          <Link href="/receiving">Open Receiving</Link>
        </Button>
      </div>
      {rows.length === 0 ? null : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="sticky top-0 bg-card text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Reference</th>
                <th className="px-4 py-2 font-medium">Product</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 font-medium">Supplier</th>
                <th className="px-4 py-2 font-medium">Expected</th>
                <th className="px-4 py-2 font-medium">PO</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{row.reference}</td>
                  <td className="px-4 py-2">
                    <p className="font-medium">{row.productName}</p>
                    <p className="text-xs text-muted-foreground">{row.sku}</p>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatQty(row.quantity)}</td>
                  <td className="px-4 py-2">{row.supplierName ?? "Unknown"}</td>
                  <td className="px-4 py-2 tabular-nums">{formatStamp(row.expectedAt)}</td>
                  <td className="px-4 py-2">
                    {row.purchaseOrderId ? (
                      <Link href={`/purchase-orders/${row.purchaseOrderId}`} className="text-primary hover:underline">
                        {row.purchaseOrderNumber ?? "PO"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProcurementReport({ data }: { data: ReportingSnapshot }) {
  const p = data.materialPlan;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <KpiStrip
        kpis={[
          { id: "req", label: "Requisitions", value: String(p.pendingReview), hint: "Pending procurement review", risk: "MEDIUM", href: "/procurement", available: true },
          { id: "rfq", label: "RFQs", value: String(p.rfqTotal), hint: `${p.rfqsAwarded} awarded`, risk: "HEALTHY", href: "/rfqs", available: true },
          { id: "po", label: "Approved PO value", value: p.poApprovedValue != null && p.poApprovedCurrency ? `${p.poApprovedCurrency} ${p.poApprovedValue.toLocaleString("en-KE")}` : "—", hint: `${p.poApproved} approved POs`, risk: "HEALTHY", href: "/purchase-orders", available: p.poApprovedValue != null },
          { id: "open", label: "Outstanding qty", value: String(p.receivingOutstandingQty), hint: "Open PO exposure unreceived", risk: p.receivingOutstandingQty > 0 ? "HIGH" : "HEALTHY", href: "/receiving", available: true },
        ]}
      />
      <BarPanel
        title="Procurement lifecycle (actual counts)"
        rows={data.procurementPipeline.map((row) => ({ id: row.id, label: row.label, value: row.count, hint: "" }))}
        hrefFor={(id) => data.procurementPipeline.find((row) => row.id === id)?.href ?? "/procurement"}
      />
      <FunnelChart title="Procurement Pipeline" stages={data.procurementPipeline} />
      <p className="text-xs text-muted-foreground">Counts are independent snapshots. A later stage does not imply a record moved from an earlier stage.</p>
      <SimpleTable
        title="Pipeline detail"
        empty="No procurement records in this tenant."
        columns={["Stage", "Count", "Workspace"]}
        rows={data.procurementPipeline.map((row) => ({
          id: row.id,
          href: row.href,
          cells: [row.label, String(row.count), row.href],
        }))}
      />
      <InboundReceiptsPanel rows={data.inboundReceipts} />
    </div>
  );
}

function SuppliersReport({ data }: { data: ReportingSnapshot }) {
  const p = data.materialPlan;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <KpiStrip
        kpis={[
          { id: "hist", label: "With history", value: String(p.supplierPerfWithHistory), hint: "Phase 25 scorecards", risk: "HEALTHY", href: "/supplier-performance", available: true },
          { id: "comp", label: "Completion", value: p.supplierPerfCompletionRate == null ? "—" : `${p.supplierPerfCompletionRate}%`, hint: "Received ÷ ordered", risk: "HEALTHY", href: "/supplier-performance", available: true },
          { id: "disc", label: "Discrepancy rate", value: p.supplierPerfDiscrepancyRate == null ? "—" : `${p.supplierPerfDiscrepancyRate}%`, hint: "Receipt events with discrepancy", risk: (p.supplierPerfDiscrepancyRate ?? 0) > 0 ? "MEDIUM" : "HEALTHY", href: "/receiving", available: true },
          { id: "attn", label: "Needs attention", value: String(p.supplierPerfAttention), hint: "Watch / Risk bands", risk: p.supplierPerfAttention > 0 ? "MEDIUM" : "HEALTHY", href: "/supplier-performance?view=attention", available: true },
        ]}
        notes={data.metricNotes}
      />
      <HorizontalBarChart
        title="Supplier Performance Score"
        description="Phase 25 deterministic score bands."
        rows={data.supplierBands.map((row) => ({
          id: row.id,
          label: row.label,
          value: row.count,
          href: "/supplier-performance",
          tone: row.id === "RISK" ? "danger" : row.id === "WATCH" ? "material" : row.id === "EXCELLENT" ? "intel" : "neutral",
        }))}
      />
      <SimpleTable
        title="Needs attention"
        empty="No Watch or Risk suppliers, or history is insufficient."
        columns={["Supplier", "Band", "Evidence"]}
        rows={data.supplierAttention.map((row) => ({
          id: row.id,
          href: `/supplier-performance?q=${encodeURIComponent(row.name)}`,
          cells: [row.name, row.band, row.reason],
        }))}
      />
    </div>
  );
}

function SimpleTable({
  title,
  empty,
  columns,
  rows,
}: {
  title: string;
  empty: string;
  columns: string[];
  rows: Array<{ id: string; href: string; cells: string[] }>;
}) {
  return (
    <section className="min-w-0 overflow-hidden work-surface">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState title={empty} description="Filters and tenant scope apply." />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-2 font-medium">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    {row.cells.map((cell, index) => (
                      <td key={`${row.id}-${index}`} className="px-4 py-2">
                        {index === 0 ? (
                          <Link href={row.href} className="font-medium hover:underline">
                            {cell}
                          </Link>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 px-4 pb-4 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg p-3 ring-1 ring-foreground/10">
                <Link href={row.href} className="text-sm font-medium hover:underline">
                  {row.cells[0]}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">{row.cells.slice(1).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  empty,
}: {
  label: string;
  value: string;
  onChange: (value: string | undefined) => void;
  options: Array<{ id: string; label: string }>;
  empty: string;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <select
        className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8 md:max-w-52"
        value={value}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{empty}</option>
        {options.map((row) => (
          <option key={row.id} value={row.id}>
            {row.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function KpiStrip({ kpis, notes }: { kpis: ReportingSnapshot["kpis"]; notes?: ReportingSnapshot["metricNotes"] }) {
  const how = (id: string) => notes?.find((note) => note.id === id || (id === "revenue" && note.id === "revenue"))?.how;
  return (
    <section aria-label="Reporting metrics" className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-4 xl:overflow-visible 2xl:grid-cols-7">
      {kpis.map((kpi) => (
        <Link
          key={kpi.id}
          href={kpi.href}
          title={how(kpi.id) ?? kpi.hint}
          className="min-w-[9.5rem] shrink-0 border-r border-border px-3.5 py-3 last:border-r-0 transition duration-150 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring xl:min-w-0"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
            <StatusBadge tone={riskTone[kpi.risk]}>{kpi.risk}</StatusBadge>
          </div>
          <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{kpi.available ? kpi.value : "Unavailable"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
        </Link>
      ))}
    </section>
  );
}

function HistoryPanel({ data }: { data: ReportingSnapshot }) {
  if (data.history.length < 2) return null;
  const max = Math.max(1, ...data.history.map((row) => row.quantity));
  return (
    <section className="work-surface p-4">
      <h2 className="text-sm font-semibold tracking-tight">Inventory quantity by week</h2>
      <p className="mt-1 text-xs text-muted-foreground">{data.historyNote}</p>
      <ul className="mt-3 flex h-28 items-end gap-1">
        {data.history.map((row) => (
          <li key={row.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="w-full rounded-sm bg-primary" style={{ height: `${Math.max(6, (row.quantity / max) * 100)}%` }} title={`${row.label}: ${formatQty(row.quantity)}`} />
            <span className="truncate text-[10px] text-muted-foreground">{row.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Overview({ data, href, onOpen }: { data: ReportingSnapshot; href: (patch: Record<string, string | undefined>) => string; onOpen: (id: string) => void }) {
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-2">
      <HistoryPanel data={data} />
      <BarPanel
        title="Inventory composition"
        rows={data.composition.map((row) => ({ id: row.id, label: row.label, value: row.quantity, hint: `${row.share}%` }))}
        hrefFor={(id) => href({ view: id === "FINISHED_GOOD" ? "finished-goods" : id === "RAW_MATERIAL" ? "raw-materials" : "packaging" })}
      />
      <BarPanel
        title="Inventory health"
        rows={data.health.map((row) => ({ id: row.id, label: row.label, value: row.count, hint: formatQty(row.quantity) }))}
        hrefFor={(id) => `/inventory?view=health&status=${id}`}
      />
      <BarPanel
        title="Expiry exposure"
        rows={data.expiryBuckets.filter((row) => row.quantity > 0).slice(0, 6).map((row) => ({ id: row.id, label: row.label, value: row.quantity, hint: `${row.share}%` }))}
        hrefFor={(id) => href({ view: "expiry", bucket: id })}
      />
      <section className="work-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Highest expiry risk</h2>
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
            <Link href="/inventory?view=expiry">View expiry</Link>
          </Button>
        </div>
        <RankList items={data.topExpiry} onOpen={onOpen} />
      </section>
      <section className="work-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Production risk</h2>
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
            <Link href="/operations">Open Operations Planner</Link>
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {data.production.atRisk} at risk · {data.production.unscheduled} unscheduled · {data.production.completed} completed · {data.production.utilization} capacity
        </p>
        <BarPanel
          embedded
          title=""
          rows={data.production.statuses.map((row) => ({ id: row.id, label: row.label, value: row.count, hint: "" }))}
          hrefFor={(id) => href({ view: "production", status: id })}
        />
      </section>
    </div>
  );
}

function InventoryBody({
  data,
  rows,
  page,
  pages,
  pageSize,
  total,
  setPage,
  onOpen,
  href,
  sortKey,
  sortDir,
  onSort,
}: {
  data: ReportingSnapshot;
  rows: ReportLot[];
  page: number;
  pages: number;
  pageSize: LotPageSize;
  total: number;
  setPage: (page: number) => void;
  onOpen: (id: string) => void;
  href: (patch: Record<string, string | undefined>) => string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const composition = useMemo(
    () =>
      [...new Map(data.lots.map((lot) => [lot.category, 0] as const)).keys()].map((category) => {
        const quantity = data.lots.filter((lot) => lot.category === category).reduce((sum, lot) => sum + lot.quantity, 0);
        return { id: category, label: category, value: quantity, hint: "" };
      }),
    [data.lots]
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <InventoryDeepLinks href={href} />
      <HistoryPanel data={data} />
      <InboundReceiptsPanel rows={data.inboundReceipts} />
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <BarPanel title="By category" rows={composition} hrefFor={(id) => href({ category: id })} />
        <BarPanel
          title="By warehouse"
          rows={data.warehouses.map((warehouse) => ({
            id: warehouse.id,
            label: warehouse.name,
            value: data.lots.filter((lot) => lot.warehouseId === warehouse.id).reduce((sum, lot) => sum + lot.quantity, 0),
            hint: "",
          }))}
          hrefFor={(id) => href({ warehouse: id })}
        />
      </div>
      {data.concentration ? (
        <p className="text-sm text-muted-foreground">
          Concentration: {data.concentration.title} is {data.concentration.share}% of quantity in scope.
        </p>
      ) : null}
      <LotTable
        lots={rows}
        page={page}
        pages={pages}
        pageSize={pageSize}
        total={total}
        setPage={setPage}
        onOpen={onOpen}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        href={href}
      />
    </div>
  );
}

function ClassReport({
  data,
  rows,
  page,
  pages,
  pageSize,
  total,
  setPage,
  onOpen,
  href,
  sortKey,
  sortDir,
  onSort,
}: {
  data: ReportingSnapshot;
  rows: ReportLot[];
  page: number;
  pages: number;
  pageSize: LotPageSize;
  total: number;
  setPage: (page: number) => void;
  onOpen: (id: string) => void;
  href: (patch: Record<string, string | undefined>) => string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <HistoryPanel data={data} />
      {data.concentration ? (
        <p className="text-sm text-muted-foreground">
          {data.concentration.title} holds {data.concentration.share}% of this class ({formatQty(data.concentration.quantity)}).
        </p>
      ) : null}
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <BarPanel
          title="Expiry in this class"
          rows={data.expiryBuckets.filter((row) => row.quantity > 0).map((row) => ({ id: row.id, label: row.label, value: row.quantity, hint: `${row.share}%` }))}
          hrefFor={(id) => href({ view: "expiry", bucket: id })}
        />
        <BarPanel
          title="Ageing in this class"
          rows={data.ageingBuckets.filter((row) => row.quantity > 0).map((row) => ({ id: row.id, label: row.label, value: row.quantity, hint: `${row.share}%` }))}
          hrefFor={(id) => href({ view: "ageing", bucket: id })}
        />
      </div>
      <section className="work-surface p-4">
        <h2 className="text-sm font-semibold tracking-tight">Highest value lots</h2>
        <RankList items={data.highValue} onOpen={onOpen} />
      </section>
      <LotTable
        lots={rows}
        page={page}
        pages={pages}
        pageSize={pageSize}
        total={total}
        setPage={setPage}
        onOpen={onOpen}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        href={href}
      />
    </div>
  );
}

function BucketReport({
  title,
  rows,
  lots,
  ranked,
  href,
  onOpen,
  heatmap = false,
}: {
  title: string;
  rows: ReportingSnapshot["expiryBuckets"];
  lots: ReportLot[];
  ranked: ReportingSnapshot["topExpiry"];
  href: (patch: Record<string, string | undefined>) => string;
  onOpen: (id: string) => void;
  heatmap?: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => row.quantity));
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section className="min-w-0 overflow-hidden work-surface">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="sticky top-0 bg-card text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Bucket</th>
                <th className="px-4 py-2 text-right font-medium">Quantity</th>
                <th className="px-4 py-2 text-right font-medium">Share</th>
                <th className="px-4 py-2 font-medium">Risk</th>
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
                  <td className="px-4 py-2">
                    <StatusBadge tone={riskTone[row.risk]}>{row.risk}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="work-surface p-4">
        <h2 className="text-sm font-semibold tracking-tight">{ranked.length > 0 ? "Highest expiry risk" : "Lots in view"}</h2>
        {ranked.length > 0 ? (
          <RankList items={ranked} onOpen={onOpen} />
        ) : lots.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No lots in this bucket.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {lots.slice(0, 8).map((lot) => (
              <li key={lot.id}>
                <button type="button" className="w-full text-left text-sm hover:underline" onClick={() => onOpen(lot.id)}>
                  {lot.productName} · {formatQty(lot.quantity)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProductionReport({
  data,
  href,
  onOpenOrder,
}: {
  data: ReportingSnapshot;
  href: (patch: Record<string, string | undefined>) => string;
  onOpenOrder: (id: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data.production.scheduled} scheduled · {data.production.inProgress} in progress · {data.production.unscheduled} unscheduled · {data.production.atRisk} at risk · {data.production.completed} completed · {data.production.critical} critical
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
            <Link href="/execution/production">Production execution</Link>
          </Button>
          <Button asChild size="sm" className="min-h-11 sm:min-h-7">
            <Link href="/operations">Open Operations Planner</Link>
          </Button>
        </div>
      </div>
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <BarPanel
          title="Production status"
          rows={data.production.statuses.map((row) => ({ id: row.id, label: row.label, value: row.count, hint: "" }))}
          hrefFor={(id) => href({ status: id })}
        />
        <HorizontalBarChart
          title="Workstation Capacity"
          description="Utilization from the operations planner window."
          rows={data.production.lines.map((row) => ({
            id: row.id,
            label: row.name,
            value: row.utilization,
            hint: `${row.orders} orders`,
            href: href({ workstation: row.id }),
            tone: row.utilization >= 95 ? "danger" : row.utilization >= 85 ? "material" : "neutral",
          }))}
          valueSuffix="%"
        />
        <GroupedBarChart
          title="Production: Planned vs Actual"
          rows={data.production.plannedVsActual}
          note="Produced quantity reflects completed production orders only."
        />
      </div>
      <section className="work-surface p-4">
        <h2 className="text-sm font-semibold tracking-tight">Due-date risk</h2>
        {data.production.dueRisk.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No orders are currently past due in the planner window.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.production.dueRisk.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full min-h-11 items-center justify-between gap-3 text-left text-sm hover:underline"
                  onClick={() => onOpenOrder(row.id)}
                  aria-label={`Inspect ${row.title}`}
                >
                  <span>
                    <span className="font-medium">{row.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {row.detail} · {formatQty(row.quantity)} · {row.meta}
                    </span>
                  </span>
                  <StatusBadge tone={riskTone[row.risk]}>{row.risk}</StatusBadge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="min-w-0 overflow-hidden work-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm" aria-label="Production orders">
            <thead className="sticky top-0 bg-card text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 font-medium">Line</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {data.production.orders.map((order) => (
                <tr key={order.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => onOpenOrder(order.id)}
                      aria-label={`Inspect ${order.orderNumber}`}
                    >
                      <p className="font-medium">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{order.productName}</p>
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatQty(order.quantity)}</td>
                  <td className="px-4 py-2">{order.workstationName ?? "—"}</td>
                  <td className="px-4 py-2">
                    <StatusBadge tone={riskTone[order.displayStatus === "AT_RISK" ? "HIGH" : order.displayStatus === "UNSCHEDULED" ? "MEDIUM" : "HEALTHY"]}>
                      {order.displayStatus.replace(/_/g, " ")}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-2 tabular-nums">{formatStamp(order.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MaterialsReport({ data, onOpen }: { data: ReportingSnapshot; onOpen: (id: string) => void }) {
  const attention = data.materials.filter((row) => row.mrpRisk === "CRITICAL" || row.mrpRisk === "HIGH" || row.risk !== "HEALTHY");
  const plan = data.materialPlan;
  return (
    <section className="work-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Material requirements</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {plan.required} materials required · {formatQty(plan.shortageQty)} projected shortage · {plan.atRisk} at risk · {plan.ordersAffected} production orders affected · {plan.incomingCoverage}% incoming coverage
          </p>
          {plan.concentration ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Shortage concentration: {plan.concentration.title} ({plan.concentration.sku}) {plan.concentration.share}% of net shortfall
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/materials">Open material requirements</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/procurement">Open procurement planning</Link>
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Procurement: {plan.procurementAttention} attention · {plan.criticalRequisitions} critical · {formatQty(plan.requestedQuantity)} suggested qty · {plan.pendingReview} pending review
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Supplier intelligence: {plan.supplierCoverage}% material coverage · {plan.preferredCoverage}% preferred coverage · {plan.leadTimeVisibility}% lead-time visibility · {plan.pricingVisibility}% pricing visibility
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        RFQs: {plan.rfqTotal} total · {plan.rfqsAwaitingResponse} awaiting response · {plan.rfqsInEvaluation} evaluation · {plan.rfqsAwarded} awarded · {plan.rfqResponseCoverage}% response coverage
        {plan.rfqAverageLeadTimeDays !== null ? ` · ${plan.rfqAverageLeadTimeDays}d avg lead time` : " · avg lead time not available"}
        {plan.rfqQuotedValue !== null && plan.rfqQuotedCurrency
          ? ` · ${plan.rfqQuotedCurrency} ${plan.rfqQuotedValue.toLocaleString("en-KE")} quoted`
          : " · quoted value not available"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        POs: {plan.poDraft} draft · {plan.poPendingApproval} pending approval · {plan.poApproved} approved
        {plan.poApprovedValue !== null && plan.poApprovedCurrency
          ? ` · ${plan.poApprovedCurrency} ${plan.poApprovedValue.toLocaleString("en-KE")} approved purchasing value`
          : " · approved purchasing value not available"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Receiving: {plan.receivingAwaiting} awaiting · {plan.receivingPartial} partial · {plan.receivingComplete} complete ·{" "}
        {plan.receivingOutstandingQty.toLocaleString("en-KE")} outstanding qty · {plan.receivingDiscrepancies} with discrepancies
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Supplier performance: {plan.supplierPerfWithHistory} with history
        {plan.supplierPerfCompletionRate !== null ? ` · ${plan.supplierPerfCompletionRate}% completion` : " · completion unavailable"}
        {plan.supplierPerfDiscrepancyRate !== null ? ` · ${plan.supplierPerfDiscrepancyRate}% discrepancy` : " · discrepancy unavailable"}
        {plan.supplierPerfConcentration !== null ? ` · top supplier ${plan.supplierPerfConcentration}% concentration` : ""}
        {" · "}
        {plan.supplierPerfAttention} need attention · {plan.supplierPerfOpenExposure} with open exposure
      </p>
      <div className="mt-4">
        <HorizontalBarChart
          embedded
          title="Material requirement vs available"
          rows={[...data.materials]
            .sort((a, b) => b.netRequirement - a.netRequirement)
            .slice(0, 8)
            .map((row) => ({
              id: row.id,
              label: row.title,
              value: row.requirement,
              hint: `${formatQty(row.available)} available · ${formatQty(row.incoming)} incoming`,
              href: "/materials",
              tone: row.mrpRisk === "CRITICAL" || row.risk === "CRITICAL" ? "danger" : row.mrpRisk === "HIGH" ? "material" : "neutral",
            }))}
        />
      </div>
      {attention.length === 0 ? (
        <EmptyState className="mt-3 py-8" title="No material shortages" description="Stock plus open inbound covers known production requirements." />
      ) : (
        <RankList
          items={attention.map((row) => ({
            id: row.id,
            title: row.title,
            detail: row.mrpRisk ? `MRP ${row.mrpRisk}` : row.status.replace(/_/g, " ").toLowerCase(),
            quantity: row.netRequirement || row.stock,
            risk: row.mrpRisk && row.mrpRisk !== "OK" ? row.mrpRisk : row.risk,
            meta: row.hasBom ? `Need ${formatQty(row.requirement)} · inbound ${formatQty(row.incoming)}` : `Inbound ${formatQty(row.incoming)}`,
          }))}
          onOpen={(id) => {
            const lot = data.lots.find((row) => row.sku === id);
            if (lot) onOpen(lot.id);
          }}
        />
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="py-2 font-medium">Material</th>
              <th className="py-2 text-right font-medium">On hand</th>
              <th className="py-2 text-right font-medium">Inbound</th>
              <th className="py-2 text-right font-medium">Need</th>
              <th className="py-2 text-right font-medium">Projected</th>
              <th className="py-2 text-right font-medium">Net</th>
              <th className="py-2 font-medium">Risk</th>
            </tr>
          </thead>
          <tbody>
            {data.materials.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="py-2">
                  <p className="font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.suppliers.join(", ") || "No supplier"}
                    {row.affectedOrders > 0 ? ` · ${row.affectedOrders} orders` : ""}
                  </p>
                </td>
                <td className="py-2 text-right tabular-nums">{formatQty(row.stock)}</td>
                <td className="py-2 text-right tabular-nums">{formatQty(row.incoming)}</td>
                <td className="py-2 text-right tabular-nums">{row.hasBom ? formatQty(row.requirement) : "—"}</td>
                <td className="py-2 text-right tabular-nums">{row.hasBom ? formatQty(row.projected) : "—"}</td>
                <td className="py-2 text-right tabular-nums">{row.hasBom ? formatQty(row.netRequirement) : "—"}</td>
                <td className="py-2">
                  <StatusBadge tone={riskTone[row.mrpRisk ?? row.risk]}>{row.mrpRisk ?? row.risk}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LotTable({
  lots,
  page,
  pages,
  pageSize,
  total,
  setPage,
  onOpen,
  sortKey,
  sortDir,
  onSort,
  href,
}: {
  lots: ReportLot[];
  page: number;
  pages: number;
  pageSize: LotPageSize;
  total: number;
  setPage: (page: number) => void;
  onOpen: (id: string) => void;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  href: (patch: Record<string, string | undefined>) => string;
}) {
  const router = useRouter();
  if (total === 0) {
    return <EmptyState title="No inventory lots" description="No lots match the current filters." />;
  }
  const header = (key: SortKey, label: string, align: "left" | "right" = "left") => (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button type="button" className="hover:underline" onClick={() => onSort(key)}>
        {label}
        {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  const fromRow = page * pageSize + 1;
  const toRow = Math.min(total, page * pageSize + lots.length);
  return (
    <section className="min-w-0 overflow-hidden work-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="sticky top-0 bg-card text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              {header("product", "Item")}
              {header("quantity", "Qty", "right")}
              {header("value", "Value", "right")}
              <th className="px-4 py-2 font-medium">Warehouse</th>
              <th className="px-4 py-2 font-medium">Class</th>
              {header("age", "Age")}
              {header("expiry", "Expiry")}
              {header("risk", "Risk")}
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <tr key={lot.id} className="border-t border-border">
                <td className="px-4 py-2">
                  <button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(lot.id)}>
                    {lot.productName}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {lot.batchCode} · {lot.sku}
                    {lot.supplierName ? ` · ${lot.supplierName}` : ""}
                  </p>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatQty(lot.quantity)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{lot.value}</td>
                <td className="px-4 py-2">{lot.warehouseName}</td>
                <td className="px-4 py-2">{lot.classId.replace(/_/g, " ").toLowerCase()}</td>
                <td className="px-4 py-2 tabular-nums">{lot.ageDays}d</td>
                <td className="px-4 py-2 tabular-nums">{lot.daysRemaining === null ? "—" : lot.daysRemaining < 0 ? `${Math.abs(lot.daysRemaining)}d overdue` : `${lot.daysRemaining}d`}</td>
                <td className="px-4 py-2">
                  <StatusBadge tone={riskTone[lotRisk(lot)]}>{lotRisk(lot)}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <p>
          {fromRow}–{toRow} of {total} lot{total === 1 ? "" : "s"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span>Rows</span>
            <select
              className="h-11 rounded-lg border border-input bg-transparent px-2 text-sm md:h-8"
              value={pageSize}
              aria-label="Rows per page"
              onChange={(event) => {
                setPage(0);
                router.push(href({ pageSize: event.target.value === "50" ? undefined : event.target.value }));
              }}
            >
              {LOT_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="tabular-nums">
            {page + 1}/{pages}
          </span>
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}

function BarPanel({
  title,
  rows,
  embedded = false,
  hrefFor,
}: {
  title: string;
  rows: Array<{ id: string; label: string; value: number; hint: string }>;
  embedded?: boolean;
  hrefFor?: (id: string) => string;
}) {
  if (embedded) {
    if (rows.length === 0) return <div className="mt-3 text-sm text-muted-foreground">No data in this view.</div>;
    return (
      <HorizontalBarChart
        title=""
        rows={rows.map((row) => ({ ...row, href: hrefFor?.(row.id) }))}
        embedded
      />
    );
  }

  return (
    <HorizontalBarChart
      title={title}
      rows={rows.map((row) => ({ ...row, href: hrefFor?.(row.id) }))}
    />
  );
}

function RankList({ items, onOpen }: { items: ReportingSnapshot["topExpiry"]; onOpen: (id: string) => void }) {
  if (items.length === 0) return <p className="mt-3 text-sm text-muted-foreground">Nothing requires immediate attention.</p>;
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item.id)}
            className="flex w-full items-start justify-between gap-3 rounded-lg px-1 py-1.5 text-left transition duration-150 hover:bg-muted/50"
          >
            <span>
              <span className="block text-sm font-medium">{item.title}</span>
              <span className="text-xs text-muted-foreground">
                {item.detail} · {formatQty(item.quantity)} · {item.meta}
              </span>
            </span>
            <StatusBadge tone={riskTone[item.risk]}>{item.risk}</StatusBadge>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LotDetail({ lot }: { lot: ReportLot }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{lot.productName}</SheetTitle>
        <SheetDescription>
          {lot.batchCode} · {lot.sku}
        </SheetDescription>
      </SheetHeader>
      <dl className="grid grid-cols-2 gap-3 px-4 pb-6 text-sm">
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Quantity</dt>
          <dd className="mt-0.5 tabular-nums">{formatQty(lot.quantity)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Value</dt>
          <dd className="mt-0.5">{lot.value}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Warehouse</dt>
          <dd className="mt-0.5">{lot.warehouseName}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Supplier</dt>
          <dd className="mt-0.5">{lot.supplierName ?? "Internal"}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Class</dt>
          <dd className="mt-0.5">{lot.classId.replace(/_/g, " ").toLowerCase()}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Received</dt>
          <dd className="mt-0.5">{formatStamp(lot.receivedAt)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Expiry</dt>
          <dd className="mt-0.5">{lot.expiryDate ? formatStamp(lot.expiryDate) : "Not dated"}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Age</dt>
          <dd className="mt-0.5">{lot.ageDays} days</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Risk</dt>
          <dd className="mt-0.5">
            <StatusBadge tone={riskTone[lotRisk(lot)]}>{lotRisk(lot)}</StatusBadge>
          </dd>
        </div>
      </dl>
    </>
  );
}

function ProductionOrderDetail({ order }: { order: ProductionOrderRow }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{order.orderNumber}</SheetTitle>
        <SheetDescription>{order.productName}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6 text-sm">
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Status</dt>
            <dd className="mt-0.5">{order.displayStatus.replace(/_/g, " ")}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Priority</dt>
            <dd className="mt-0.5">{order.priority}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Quantity</dt>
            <dd className="mt-0.5 tabular-nums">{formatQty(order.quantity)}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Workstation</dt>
            <dd className="mt-0.5">{order.workstationName ?? "Not assigned"}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Due</dt>
            <dd className="mt-0.5">{formatStamp(order.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Planned start</dt>
            <dd className="mt-0.5">{order.plannedStart ? formatStamp(order.plannedStart) : "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Planned end</dt>
            <dd className="mt-0.5">{order.plannedEnd ? formatStamp(order.plannedEnd) : "Not recorded"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button asChild size="sm" className="min-h-11 sm:min-h-8">
            <Link href={`/operations?order=${order.id}`}>Open in Operations</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
            <Link href={`/execution/production?order=${order.id}`}>Open execution</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
