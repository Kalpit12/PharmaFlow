"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
import { useCompactLayout } from "@/hooks/use-compact-layout";
import { MATERIAL_RISKS, type MaterialRisk } from "@/lib/materials/types";
import {
  PROCUREMENT_VIEWS,
  type ProcurementRecommendation,
  type ProcurementRequisitionDetail,
  type ProcurementRowStatus,
  type ProcurementSnapshot,
  type ProcurementViewId,
} from "@/lib/procurement/types";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<ProcurementViewId, string> = {
  all: "All",
  critical: "Critical",
  "needs-review": "Needs review",
  reviewed: "Reviewed",
  rejected: "Rejected",
};

const riskTone: Record<MaterialRisk, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "warning",
  OK: "success",
};

const rowStatusTone: Record<ProcurementRowStatus, StatusTone> = {
  RECOMMENDATION: "info",
  MONITOR: "neutral",
  DRAFT: "warning",
  REVIEWED: "success",
  REJECTED: "neutral",
};

const rowStatusLabel: Record<ProcurementRowStatus, string> = {
  RECOMMENDATION: "Recommendation",
  MONITOR: "Monitor",
  DRAFT: "Draft",
  REVIEWED: "Reviewed",
  REJECTED: "Rejected",
};

function formatQty(value: number): string {
  return value.toLocaleString("en-KE", { maximumFractionDigits: 3 });
}

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function ProcurementWorkspace({
  data,
  canReview,
  initialRequisitionId,
}: {
  data: ProcurementSnapshot;
  canReview: boolean;
  initialRequisitionId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<"priority" | "material" | "shortage" | "due">("priority");
  const [selectedRow, setSelectedRow] = useState<ProcurementRecommendation | null>(null);
  const [detail, setDetail] = useState<ProcurementRequisitionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const activeFilters = ["risk", "q", "material", "order"].filter((key) => searchParams.get(key)).length;

  const sorted = useMemo(() => {
    const rows = [...data.rows];
    const rank: Record<MaterialRisk, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, OK: 0 };
    rows.sort((a, b) => {
      if (sortKey === "material") return a.sku.localeCompare(b.sku);
      if (sortKey === "shortage") return b.netRequirement - a.netRequirement;
      if (sortKey === "due") return (a.earliestDueDate ?? "9999").localeCompare(b.earliestDueDate ?? "9999");
      return rank[b.risk] - rank[a.risk] || b.netRequirement - a.netRequirement;
    });
    return rows;
  }, [data.rows, sortKey]);

  const openRow = (row: ProcurementRecommendation) => {
    setSelectedRow(row);
    setDetail(null);
    setError(null);
    if (row.requisitionId) void loadDetail(row.requisitionId);
  };

  const loadDetail = async (id: string) => {
    try {
      const result = await fetch(`/api/procurement/requisitions/${id}`);
      const payload = (await result.json()) as { requisition?: ProcurementRequisitionDetail; message?: string };
      if (!result.ok || !payload.requisition) {
        setError(payload.message ?? "Unable to load requisition.");
        return;
      }
      setDetail(payload.requisition);
    } catch {
      setError("Unable to load requisition.");
    }
  };

  const createDraft = async (productId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch("/api/procurement/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const payload = (await result.json()) as { requisition?: ProcurementRequisitionDetail; message?: string };
      if (!result.ok || !payload.requisition) {
        setError(payload.message ?? "Unable to create requisition draft.");
        return;
      }
      setDetail(payload.requisition);
      router.refresh();
    } catch {
      setError("Unable to create requisition draft.");
    } finally {
      setBusy(false);
    }
  };

  const createRfq = async (productId: string, requisitionId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch("/api/procurement-rfqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "from-procurement", productId, requisitionId }),
      });
      const payload = (await result.json()) as { rfq?: { id: string }; message?: string };
      if (!result.ok || !payload.rfq) {
        setError(payload.message ?? "Unable to create RFQ draft.");
        return;
      }
      router.push(`/rfqs/${payload.rfq.id}`);
    } catch {
      setError("Unable to create RFQ draft.");
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, decision: "review" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(`/api/procurement/requisitions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await result.json()) as { requisition?: ProcurementRequisitionDetail; message?: string };
      if (!result.ok || !payload.requisition) {
        setError(payload.message ?? "Unable to update requisition.");
        return;
      }
      setDetail(payload.requisition);
      router.refresh();
    } catch {
      setError("Unable to update requisition.");
    } finally {
      setBusy(false);
    }
  };

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
          {MATERIAL_RISKS.filter((risk) => risk !== "OK").map((risk) => (
            <option key={risk} value={risk}>
              {risk}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
        <span className="shrink-0 text-muted-foreground">Status</span>
        <select
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={searchParams.get("view") ?? "all"}
          onChange={(event) => router.push(href({ view: event.target.value || undefined }))}
        >
          {PROCUREMENT_VIEWS.map((view) => (
            <option key={view} value={view}>
              {VIEW_LABEL[view]}
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
          { id: "need", label: "Need", href: "/materials" },
          { id: "requisition", label: "Requisition" },
          { id: "rfq", label: "RFQ", href: "/rfqs" },
          { id: "award", label: "Award" },
          { id: "po", label: "PO", href: "/purchase-orders" },
          { id: "receiving", label: "Receiving", href: "/receiving" },
        ]}
        current="requisition"
      />
      <p className="text-sm text-muted-foreground">
        {data.planningNote}{" "}
        <Link href="/rfqs" className="font-medium text-foreground hover:underline">
          RFQ Management
        </Link>
        {" · "}
        <Link href="/purchase-orders" className="font-medium text-foreground hover:underline">
          Purchase Orders
        </Link>
        {" · "}
        <Link href="/receiving" className="font-medium text-foreground hover:underline">
          Receiving
        </Link>
        {" · "}
        <Link href="/supplier-performance" className="font-medium text-foreground hover:underline">
          Supplier performance
        </Link>
      </p>

      <div className="flex min-w-0 flex-col gap-3 work-surface p-3">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Procurement views" className="hidden min-w-0 flex-wrap gap-1 lg:flex">
            {PROCUREMENT_VIEWS.map((view) => (
              <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-7">
                <Link href={href({ view })}>{VIEW_LABEL[view]}</Link>
              </Button>
            ))}
          </nav>
          <label className="flex min-w-0 items-center gap-2 text-xs font-medium lg:hidden">
            <span className="shrink-0 text-muted-foreground">View</span>
            <select
              className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={data.view}
              onChange={(event) => router.push(href({ view: event.target.value }))}
            >
              {PROCUREMENT_VIEWS.map((view) => (
                <option key={view} value={view}>
                  {VIEW_LABEL[view]}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">{data.rows.length} rows in scope</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <div className="hidden min-w-0 flex-wrap gap-2 lg:flex">{filters}</div>
          <Button type="button" size="sm" variant="outline" className="min-h-11 lg:hidden" onClick={() => setFiltersOpen(true)}>
            Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </Button>
          <SearchInput
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Material code or name"
            aria-label="Search procurement"
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

      <section aria-label="Procurement metrics" className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="min-w-[9.5rem] shrink-0 border-r border-border px-3.5 py-3 last:border-r-0 xl:min-w-0">
            <p className="min-w-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </section>

      {sorted.length === 0 ? (
        <EmptyState
          title={data.emptyReason ? "No procurement requirements identified" : "No rows"}
          description={
            data.emptyReason ??
            "This view is driven by current production demand and material availability. Adjust filters to broaden the scope."
          }
        />
      ) : (
        <div className="min-w-0 overflow-hidden work-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                <tr>
                  <SortHead label="Priority" active={sortKey === "priority"} onClick={() => setSortKey("priority")} />
                  <SortHead label="Material" active={sortKey === "material"} onClick={() => setSortKey("material")} />
                  <th className="px-3 py-2 text-right font-medium">Required</th>
                  <th className="px-3 py-2 text-right font-medium">Available</th>
                  <th className="px-3 py-2 text-right font-medium">Incoming</th>
                  <SortHead label="Shortage" active={sortKey === "shortage"} onClick={() => setSortKey("shortage")} right />
                  <th className="px-3 py-2 text-right font-medium">Suggested qty</th>
                  <th className="px-3 py-2 font-medium">Affected orders</th>
                  <SortHead label="Earliest due" active={sortKey === "due"} onClick={() => setSortKey("due")} />
                  <th className="px-3 py-2 font-medium">Risk</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={`${row.productId}-${row.requisitionId ?? "rec"}`} className="border-t border-border">
                    <td className="px-3 py-2">
                      <StatusBadge tone={riskTone[row.risk]}>{row.risk}</StatusBadge>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className="text-left hover:underline" onClick={() => openRow(row)}>
                        <span className="block font-medium">{row.name}</span>
                        <span className="text-xs text-muted-foreground">{row.sku}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(row.grossRequirement)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(row.available)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(row.incoming)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(row.netRequirement)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(row.suggestedQuantity)}</td>
                    <td className="px-3 py-2 tabular-nums">{row.affectedOrders.length}</td>
                    <td className="px-3 py-2">{formatDay(row.earliestDueDate)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={riskTone[row.risk]}>{row.risk}</StatusBadge>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={rowStatusTone[row.rowStatus]}>{rowStatusLabel[row.rowStatus]}</StatusBadge>
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
            <SheetDescription>Narrow procurement recommendations.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">{filters}</div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={selectedRow !== null || Boolean(initialRequisitionId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRow(null);
            setDetail(null);
            setError(null);
          }
        }}
      >
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-lg"}
        >
          {selectedRow ? (
            <ProcurementDetail
              row={selectedRow}
              detail={detail}
              canReview={canReview}
              busy={busy}
              error={error}
              onCreateDraft={() => void createDraft(selectedRow.productId)}
              onCreateRfq={() => void createRfq(selectedRow.productId, detail?.id)}
              onReview={(decision) => detail && void review(detail.id, decision)}
            />
          ) : null}
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

function ProcurementDetail({
  row,
  detail,
  canReview,
  busy,
  error,
  onCreateDraft,
  onCreateRfq,
  onReview,
}: {
  row: ProcurementRecommendation;
  detail: ProcurementRequisitionDetail | null;
  canReview: boolean;
  busy: boolean;
  error: string | null;
  onCreateDraft: () => void;
  onCreateRfq: () => void;
  onReview: (decision: "review" | "reject") => void;
}) {
  const active = detail ?? null;
  const status = active?.status ?? row.rowStatus;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{active ? "Requisition" : row.name}</SheetTitle>
        <SheetDescription>
          {active ? `${active.materialSku} · ${active.materialUnit}` : `${row.sku} · ${row.unit}`}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6 text-sm">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={riskTone[row.risk]}>{row.risk}</StatusBadge>
          <StatusBadge tone={rowStatusTone[status as ProcurementRowStatus] ?? "neutral"}>
            {rowStatusLabel[status as ProcurementRowStatus] ?? status}
          </StatusBadge>
        </div>

        {active ? (
          <dl className="grid grid-cols-2 gap-3">
            <Metric label="Material" value={active.materialName} />
            <Metric label="Requested quantity" value={`${formatQty(active.quantity)} ${active.materialUnit}`} />
            <Metric label="Created by" value={active.createdByName} />
            <Metric label="Created at" value={formatDay(active.createdAt)} />
            {active.reviewedByName ? <Metric label="Reviewed by" value={active.reviewedByName} /> : null}
            {active.reviewedAt ? <Metric label="Reviewed at" value={formatDay(active.reviewedAt)} /> : null}
          </dl>
        ) : null}

        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Why</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="Requirement" value={formatQty(active?.grossRequirement ?? row.grossRequirement)} />
            <Metric label="Available" value={formatQty(active?.available ?? row.available)} />
            <Metric label="Incoming" value={formatQty(active?.incoming ?? row.incoming)} />
            <Metric label="Projected" value={formatQty(active?.projectedAvailable ?? row.projectedAvailable)} />
            <Metric label="Shortage" value={formatQty(active?.netRequirement ?? row.netRequirement)} />
          </dl>
        </section>

        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Production impact</p>
          {(active?.affectedOrders ?? row.affectedOrders).length === 0 ? (
            <p className="mt-2 text-muted-foreground">None</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {(active?.affectedOrders ?? row.affectedOrders).map((order) => (
                <li key={order.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">{order.productName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Qty {formatQty(order.requiredQuantity)} · due {formatDay(order.dueDate)} · {order.priority.toLowerCase()}
                  </p>
                  <Link href="/operations" className="mt-1 inline-block text-xs hover:underline">
                    View in Operations Planner
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Recommendation</p>
          <p className="mt-2 leading-relaxed text-muted-foreground">{active?.reason ?? row.reason}</p>
        </section>
        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Supplier options</p>
          {active ? (
            <>
              <p className="mt-2 text-sm">
                <span className="font-medium">{active.supplierRecommendation.title}:</span> {active.supplierRecommendation.reason}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{active.supplierComparisonNote}</p>
              {active.supplierOptions.length === 0 ? (
                <p className="mt-2 text-muted-foreground">No supplier intelligence is available for this material yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {active.supplierOptions.slice(0, 3).map((option) => (
                    <li key={option.supplierId} className="rounded-lg border border-border px-3 py-2">
                      <p className="font-medium">
                        {option.supplierName} <span className="text-xs text-muted-foreground">({option.supplierCode})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Lead time: {option.leadTimeDays !== null ? `${option.leadTimeDays} days` : "Not available"} · Price: {option.lastKnownPrice}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-2 text-muted-foreground">Supplier comparison will appear after opening a requisition draft.</p>
          )}
          <Button asChild size="sm" variant="outline" className="mt-3 min-h-11 sm:min-h-7">
            <Link href={`/suppliers?material=${row.productId}`}>Compare suppliers</Link>
          </Button>
        </section>

        {row.rowStatus === "MONITOR" ? (
          <p className="text-sm text-muted-foreground">Low risk — monitor only. No requisition draft is suggested automatically.</p>
        ) : null}

        {!active && row.rowStatus === "RECOMMENDATION" ? (
          <div className="space-y-2">
            <Button type="button" className="min-h-11 w-full sm:min-h-9" disabled={busy} onClick={onCreateDraft}>
              Create requisition draft
            </Button>
            <Button type="button" variant="outline" className="min-h-11 w-full sm:min-h-9" disabled={busy} onClick={onCreateRfq}>
              Create RFQ
            </Button>
          </div>
        ) : null}

        {active ? (
          <Button type="button" variant="outline" className="min-h-11 w-full sm:min-h-9" disabled={busy} onClick={onCreateRfq}>
            Create RFQ
          </Button>
        ) : null}

        {active?.status === "DRAFT" && canReview ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button type="button" size="sm" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => onReview("review")}>
              Mark reviewed
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => onReview("reject")}>
              Reject
            </Button>
          </div>
        ) : null}

        {active && active.status !== "DRAFT" ? (
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {active.status === "REVIEWED"
              ? "This requisition was reviewed. No purchase order or supplier communication is created."
              : "This requisition was rejected. It cannot be executed or re-reviewed."}
          </p>
        ) : null}

        {error ? <p className="text-xs text-danger">{error}</p> : null}
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
