"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BatchDetailSheet } from "@/components/batches/BatchDetailSheet";
import { BatchesWorkspaceSimple } from "@/components/batches/BatchesWorkspaceSimple";
import { formatDay, qualityLabel, qualityTone, riskRank, riskTone, VIEW_LABEL } from "@/components/batches/batch-display";
import { EmptyState } from "@/components/ds/empty-state";
import { ProcessTrail } from "@/components/ds/process-trail";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { useLayoutMode } from "@/components/providers/preferences-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import { BATCH_QUALITY_VIEWS, type BatchesSnapshot } from "@/lib/batches/types";

export function BatchesWorkspace({ data }: { data: BatchesSnapshot }) {
  const { simple } = useLayoutMode();
  if (simple) return <BatchesWorkspaceSimple data={data} />;
  return <BatchesWorkspaceFull data={data} />;
}

function BatchesWorkspaceFull({ data }: { data: BatchesSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("batch"));
  const selected =
    data.batches.find((row) => row.id === selectedId) ??
    data.batches.find((row) => row.id === searchParams.get("batch")) ??
    null;

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const sorted = useMemo(() => {
    return [...data.batches].sort((a, b) => riskRank[b.risk] - riskRank[a.risk] || b.updatedAt.localeCompare(a.updatedAt));
  }, [data.batches]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ProcessTrail
        steps={[
          { id: "production", label: "Production", href: "/operations" },
          { id: "batch", label: "Batch" },
          { id: "materials", label: "Material lots", href: "/materials" },
          { id: "quantity", label: "Quantity" },
          { id: "quality", label: "Quality" },
          { id: "decision", label: "Decision" },
        ]}
        current="quality"
      />

      {data.attention.length > 0 ? (
        <section aria-label="Batch quality attention" className="min-w-0 work-surface p-3">
          <p className="text-sm font-medium">Quality attention</p>
          <ul className="mt-2 divide-y divide-border">
            {data.attention.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={item.severity === "CRITICAL" ? "danger" : item.severity === "HIGH" ? "danger" : "warning"}>
                      {item.severity}
                    </StatusBadge>
                    <p className="font-medium">{item.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <Link href={item.href} className="text-xs hover:underline">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3 work-surface p-3">
        <nav aria-label="Batch views" className="flex min-w-0 flex-wrap gap-1">
          {BATCH_QUALITY_VIEWS.map((view) => (
            <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-7">
              <Link href={href({ view: view === "all" ? undefined : view })}>{VIEW_LABEL[view]}</Link>
            </Button>
          ))}
        </nav>
        <SearchInput
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Batch number or product"
          aria-label="Search batches"
          className="md:max-w-56 [&_input]:h-11 md:[&_input]:h-8"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              router.push(href({ q: event.currentTarget.value || undefined }));
            }
          }}
        />
      </div>

      <section aria-label="Batch metrics" className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="min-w-[9.5rem] shrink-0 border-r border-border px-3.5 py-3 last:border-r-0 xl:min-w-0">
            <p className="min-w-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </section>

      {sorted.length === 0 ? (
        <EmptyState title="No batches to show" description={data.emptyReason ?? "Adjust filters or create production batches."} />
      ) : (
        <div className="min-w-0 overflow-hidden work-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm" aria-label="Batch operations table">
              <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Batch</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Production order</th>
                  <th className="px-3 py-2 font-medium">Manufacturing</th>
                  <th className="px-3 py-2 text-right font-medium">Quantity</th>
                  <th className="px-3 py-2 font-medium">Quality</th>
                  <th className="px-3 py-2 font-medium">Risk</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Inspect batch ${row.batchNumber}`}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <span className="block font-medium">{row.batchNumber}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <span className="block font-medium">{row.productName}</span>
                      <span className="text-xs text-muted-foreground">{row.productSku}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/operations?order=${row.productionOrderId}`} className="hover:underline">
                        {row.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{row.manufacturingStatus.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.producedLabel}/{row.plannedQuantity} {row.unit}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={qualityTone[row.qualityStatus]}>{qualityLabel[row.qualityStatus]}</StatusBadge>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={riskTone[row.risk]}>{row.risk}</StatusBadge>
                    </td>
                    <td className="px-3 py-2">{formatDay(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-lg"}
        >
          {selected ? (
            <BatchDetailSheet row={selected} canQualityAction={data.capabilities.canQualityAction} onComplete={() => router.refresh()} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
