"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
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
import type { StructuredAIResponse } from "@/lib/ai/response";
import {
  SUPPLIER_PERFORMANCE_VIEWS,
  type PerformanceBand,
  type SupplierPerformanceDetail,
  type SupplierPerformanceSnapshot,
  type SupplierPerformanceViewId,
} from "@/lib/supplier-performance/types";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<SupplierPerformanceViewId, string> = {
  all: "All",
  history: "With history",
  attention: "Needs attention",
  excellent: "Excellent / Strong",
  risk: "Watch / Risk",
  insufficient: "Insufficient data",
};

const bandTone: Record<PerformanceBand, StatusTone> = {
  EXCELLENT: "success",
  STRONG: "success",
  WATCH: "warning",
  RISK: "danger",
  INSUFFICIENT_DATA: "neutral",
};

function bandLabel(band: PerformanceBand): string {
  return band.replaceAll("_", " ");
}

export function SupplierPerformanceWorkspace({
  data,
  initialDetail,
}: {
  data: SupplierPerformanceSnapshot;
  initialDetail: SupplierPerformanceDetail | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const view = (searchParams.get("view") as SupplierPerformanceViewId) || data.view;
  const query = searchParams.get("q") ?? "";
  const selectedIds = (searchParams.get("compare") ?? "").split(",").filter(Boolean).slice(0, 3);
  const [detail, setDetail] = useState<SupplierPerformanceDetail | null>(initialDetail);
  const [detailOpen, setDetailOpen] = useState(Boolean(initialDetail));
  const [detailLoading, setDetailLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [explanation, setExplanation] = useState<StructuredAIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const toggleCompare = (supplierId: string) => {
    const next = selectedIds.includes(supplierId)
      ? selectedIds.filter((id) => id !== supplierId)
      : [...selectedIds, supplierId].slice(0, 3);
    router.replace(href({ compare: next.length ? next.join(",") : undefined }));
  };

  const openDetail = async (supplierId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const result = await fetch(`/api/supplier-performance/${supplierId}`);
      const payload = (await result.json()) as { detail?: SupplierPerformanceDetail; message?: string };
      if (!result.ok || !payload.detail) {
        setError(payload.message ?? "Unable to load supplier detail.");
        return;
      }
      setDetail(payload.detail);
      setDetailOpen(true);
      router.replace(href({ supplier: supplierId }));
    } catch {
      setError("Unable to load supplier detail.");
    } finally {
      setDetailLoading(false);
    }
  };

  const explain = async () => {
    setAiLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: data.materialId
            ? `Explain supplier performance for material ${data.materialLabel}`
            : "Explain supplier performance",
        }),
      });
      if (!res.ok) throw new Error("ai");
      setExplanation((await res.json()) as StructuredAIResponse);
    } catch {
      setError("AI explanation unavailable.");
    } finally {
      setAiLoading(false);
    }
  };

  const compareRows = useMemo(() => {
    if (data.compare.length > 0) return data.compare;
    return data.rows.filter((row) => selectedIds.includes(row.supplierId)).map((row) => ({
      supplierId: row.supplierId,
      name: row.name,
      responseRateLabel: row.responseRateLabel,
      awards: row.rfqsAwarded,
      poCount: row.poCount,
      orderedValueLabel: row.orderedValueLabel,
      completionRateLabel: row.completionRateLabel,
      discrepancyRateLabel: row.discrepancyRateLabel,
      leadTimeLabel: row.knownLeadTimeLabel,
      pricingVisibilityLabel: row.knownPricingLabel === "—" ? "Price comparison unavailable" : row.knownPricingLabel,
      preferred: row.preferred,
      confidence: row.confidence,
      band: row.band,
    }));
  }, [data.compare, data.rows, selectedIds]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">{data.planningNote}</p>
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={aiLoading} onClick={() => void explain()}>
          {aiLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
          Explain supplier performance
        </Button>
      </div>

      {data.materialLabel ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          Material filter: <span className="font-medium">{data.materialLabel}</span>{" "}
          <Link href={href({ material: undefined })} className="hover:underline">
            Clear
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {SUPPLIER_PERFORMANCE_VIEWS.map((id) => (
          <Button key={id} asChild size="xs" variant={view === id ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
            <Link href={href({ view: id === "all" ? undefined : id })}>{VIEW_LABEL[id]}</Link>
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="rounded-lg border border-border/80 px-3 py-2">
            <p className="text-[11px] uppercase text-muted-foreground">{kpi.label}</p>
            <p className="text-lg font-semibold tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      <SearchInput
        placeholder="Search supplier"
        defaultValue={query}
        aria-label="Search supplier performance"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            router.replace(href({ q: event.currentTarget.value || undefined }));
          }
        }}
      />

      {data.attention.length > 0 ? (
        <section className="rounded-xl border border-border/80">
          <div className="border-b border-border/70 px-4 py-3">
            <h2 className="text-sm font-semibold">Needs attention</h2>
          </div>
          <ul className="divide-y divide-border/60">
            {data.attention.slice(0, 6).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{item.supplierName}</p>
                  <p className="text-muted-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.evidence}</p>
                </div>
                <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => void openDetail(item.supplierId)}>
                  Review
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {compareRows.length > 0 ? (
        <section className="rounded-xl border border-border/80">
          <div className="border-b border-border/70 px-4 py-3">
            <h2 className="text-sm font-semibold">Supplier comparison (up to 3)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Response</th>
                  <th className="px-3 py-2">Awards</th>
                  <th className="px-3 py-2">POs</th>
                  <th className="px-3 py-2">Ordered</th>
                  <th className="px-3 py-2">Completion</th>
                  <th className="px-3 py-2">Discrepancy</th>
                  <th className="px-3 py-2">Band</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {compareRows.map((row) => (
                  <tr key={row.supplierId}>
                    <td className="px-3 py-2.5 font-medium">{row.name}</td>
                    <td className="px-3 py-2.5">{row.responseRateLabel}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.awards}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.poCount}</td>
                    <td className="px-3 py-2.5">{row.orderedValueLabel}</td>
                    <td className="px-3 py-2.5">{row.completionRateLabel}</td>
                    <td className="px-3 py-2.5">{row.discrepancyRateLabel}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={bandTone[row.band]}>{bandLabel(row.band)}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {data.rows.length === 0 ? (
        <EmptyState title="No supplier performance rows" description={data.emptyReason ?? "Adjust filters."} />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border/80 md:block">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Compare</th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Band</th>
                  <th className="px-3 py-2">RFQs</th>
                  <th className="px-3 py-2">Awards</th>
                  <th className="px-3 py-2">POs</th>
                  <th className="px-3 py-2">Ordered</th>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Completion</th>
                  <th className="px-3 py-2">Discrepancy</th>
                  <th className="px-3 py-2">Timing</th>
                  <th className="px-3 py-2">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.rows.map((row) => (
                  <tr key={row.supplierId} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={selectedIds.includes(row.supplierId)}
                        onChange={() => toggleCompare(row.supplierId)}
                        aria-label={`Compare ${row.name}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => void openDetail(row.supplierId)}>
                        {row.name}
                      </button>
                      <p className="text-[11px] text-muted-foreground">{row.code}{row.preferred ? " · Preferred" : ""}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={bandTone[row.band]}>{bandLabel(row.band)}</StatusBadge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {row.rfqsInvited} / {row.responseRateLabel}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.rfqsAwarded}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.poCount}</td>
                    <td className="px-3 py-2.5">{row.orderedValueLabel}</td>
                    <td className="px-3 py-2.5">{row.receivedValueLabel}</td>
                    <td className="px-3 py-2.5">{row.completionRateLabel}</td>
                    <td className="px-3 py-2.5">{row.discrepancyRateLabel}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.averageReceivingDelayLabel}</td>
                    <td className="px-3 py-2.5">{row.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {data.rows.map((row) => (
              <li key={row.supplierId} className="rounded-xl border border-border/80 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button type="button" className="text-left font-medium" onClick={() => void openDetail(row.supplierId)}>
                      {row.name}
                    </button>
                    <p className="text-xs text-muted-foreground">{row.code}</p>
                  </div>
                  <StatusBadge tone={bandTone[row.band]}>{bandLabel(row.band)}</StatusBadge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Completion</dt>
                    <dd>{row.completionRateLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Discrepancy</dt>
                    <dd>{row.discrepancyRateLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">POs</dt>
                    <dd>{row.poCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Response</dt>
                    <dd>{row.responseRateLabel}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => toggleCompare(row.supplierId)}>
                    {selectedIds.includes(row.supplierId) ? "Remove compare" : "Compare"}
                  </Button>
                  <Button type="button" size="sm" className="min-h-11" onClick={() => void openDetail(row.supplierId)}>
                    Open
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {explanation ? (
        <section className="rounded-xl border border-border/80 px-4 py-4 text-sm">
          <h2 className="font-semibold">AI explanation</h2>
          <p className="mt-2 text-muted-foreground">{explanation.summary}</p>
          {explanation.keySignals?.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {explanation.keySignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {detailLoading ? <p className="text-sm text-muted-foreground">Loading supplier detail…</p> : null}

      <Sheet
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) router.replace(href({ supplier: undefined }));
        }}
      >
        <SheetContent side={compact ? "bottom" : "right"} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detail?.name ?? "Supplier detail"}</SheetTitle>
            <SheetDescription>Deterministic performance indicators from RFQ, PO, and receiving history.</SheetDescription>
          </SheetHeader>
          {detail ? (
            <div className="space-y-4 px-4 pb-6 text-sm">
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={bandTone[detail.band]}>{bandLabel(detail.band)}</StatusBadge>
                <StatusBadge tone="neutral">Confidence {detail.confidence}</StatusBadge>
              </div>
              {detail.insufficientReasons.length > 0 ? (
                <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {detail.insufficientReasons.join(" ")}
                </p>
              ) : null}
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11px] uppercase text-muted-foreground">Response rate</dt>
                  <dd>{detail.metrics.responseRateLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase text-muted-foreground">Completion</dt>
                  <dd>{detail.metrics.completionRateLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase text-muted-foreground">Discrepancy</dt>
                  <dd>{detail.metrics.discrepancyRateLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase text-muted-foreground">Timing</dt>
                  <dd>{detail.metrics.averageReceivingDelayLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase text-muted-foreground">Lead time</dt>
                  <dd>{detail.metrics.knownLeadTimeLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase text-muted-foreground">Pricing</dt>
                  <dd>{detail.metrics.knownPricingLabel}</dd>
                </div>
              </dl>

              {detail.attentionFlags.length > 0 ? (
                <div>
                  <h3 className="font-medium">Attention</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                    {detail.attentionFlags.map((flag) => (
                      <li key={flag}>{flag}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <HistoryBlock title="RFQ history" rows={detail.rfqHistory} />
              <HistoryBlock title="Purchase orders" rows={detail.poHistory} />
              <HistoryBlock title="Receiving" rows={detail.receivingHistory} />

              {detail.discrepancies.length > 0 ? (
                <div>
                  <h3 className="font-medium">Discrepancies</h3>
                  <ul className="mt-1 space-y-2">
                    {detail.discrepancies.map((item) => (
                      <li key={item.id}>
                        <Link href={item.href} className="hover:underline">
                          {item.label}
                        </Link>
                        <p className="text-xs text-muted-foreground">{item.reason}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {detail.materials.length > 0 ? (
                <div>
                  <h3 className="font-medium">Materials supplied</h3>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {detail.materials.map((item) => (
                      <li key={item.productId}>
                        <Link href={`/supplier-performance?material=${item.productId}`} className="hover:underline">
                          {item.name} ({item.sku})
                        </Link>
                        {item.preferred ? " · Preferred" : ""} · {item.leadTimeDays !== null ? `${item.leadTimeDays}d` : "lead time —"} ·{" "}
                        {item.unitPriceLabel}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function HistoryBlock({ title, rows }: { title: string; rows: Array<{ id: string; label: string; href: string; meta: string }> }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-1 space-y-1">
        {rows.map((row) => (
          <li key={row.id}>
            <Link href={row.href} className="hover:underline">
              {row.label}
            </Link>
            <p className="text-xs text-muted-foreground">{row.meta}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
