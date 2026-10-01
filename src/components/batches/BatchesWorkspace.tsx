"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

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
import {
  BATCH_QUALITY_VIEWS,
  HOLD_REASON_PRESETS,
  type BatchQualityStatus,
  type BatchQualityViewId,
  type BatchRow,
  type BatchesSnapshot,
} from "@/lib/batches/types";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<BatchQualityViewId, string> = {
  all: "All batches",
  review: "Awaiting review",
  hold: "On hold",
  released: "Released",
  rejected: "Rejected",
};

const qualityTone: Record<BatchQualityStatus, StatusTone> = {
  PENDING_REVIEW: "info",
  ON_HOLD: "material",
  RELEASED: "intel",
  REJECTED: "danger",
};

const qualityLabel: Record<BatchQualityStatus, string> = {
  PENDING_REVIEW: "Pending review",
  ON_HOLD: "On hold",
  RELEASED: "Released",
  REJECTED: "Rejected",
};

const riskTone: Record<BatchRow["risk"], StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  WARNING: "warning",
  OK: "intel",
};

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function BatchesWorkspace({ data }: { data: BatchesSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("batch"));
  const selected = data.batches.find((row) => row.id === selectedId) ?? data.batches.find((row) => row.id === searchParams.get("batch")) ?? null;

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const sorted = useMemo(() => {
    const rank: Record<BatchRow["risk"], number> = { CRITICAL: 4, HIGH: 3, WARNING: 2, OK: 1 };
    return [...data.batches].sort((a, b) => rank[b.risk] - rank[a.risk] || b.updatedAt.localeCompare(a.updatedAt));
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
            <BatchDetail row={selected} canQualityAction={data.capabilities.canQualityAction} onComplete={() => router.refresh()} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BatchDetail({
  row,
  canQualityAction,
  onComplete,
}: {
  row: BatchRow;
  canQualityAction: boolean;
  onComplete: () => void;
}) {
  const [reason, setReason] = useState(row.holdReason ?? HOLD_REASON_PRESETS[0]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function mutate(path: "hold" | "release" | "reject") {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/batches/${row.id}/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(path === "hold" ? { reason } : {}),
        });
        const payload = (await response.json()) as { message?: string };
        if (!response.ok) {
          setError(payload.message ?? "Unable to update batch quality state.");
          return;
        }
        setMessage(payload.message ?? "Quality state updated.");
        onComplete();
      } catch {
        setError("Unable to update batch quality state.");
      }
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{row.batchNumber}</SheetTitle>
        <SheetDescription>
          {row.productName} · {row.orderNumber}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6 text-sm">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="neutral">{row.manufacturingStatus.replace(/_/g, " ")}</StatusBadge>
          <StatusBadge tone={qualityTone[row.qualityStatus]}>{qualityLabel[row.qualityStatus]}</StatusBadge>
          <StatusBadge tone={riskTone[row.risk]}>{row.risk}</StatusBadge>
        </div>

        <section aria-label="Batch identity">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Identity</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="Batch number" value={row.batchNumber} />
            <Metric label="Product" value={row.productSku} />
            <Metric label="Production order" value={row.orderNumber} />
            <Metric label="Manufacturing" value={row.manufacturingStatus.replace(/_/g, " ")} />
            <Metric label="Quality" value={qualityLabel[row.qualityStatus]} />
          </dl>
        </section>

        <section aria-label="Batch quantity" className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Quantity</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="Planned" value={`${row.plannedQuantity} ${row.unit}`} />
            <Metric label="Produced" value={row.producedLabel === "NOT_RECORDED" ? "NOT_RECORDED" : `${row.producedLabel} ${row.unit}`} />
            <Metric
              label="Remaining"
              value={row.remainingQuantity == null ? "NOT_RECORDED" : `${row.remainingQuantity} ${row.unit}`}
            />
            <Metric label="Completion" value={row.completionPercent == null ? "NOT_RECORDED" : `${row.completionPercent}%`} />
          </dl>
        </section>

        <section aria-label="Material trace" className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Material trace</p>
          {row.materialTrace.length === 0 ? (
            <p className="mt-2 text-muted-foreground">No BOM materials recorded for this product.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {row.materialTrace.map((line) => (
                <li key={line.productId} className="rounded-sm border border-border px-2 py-1.5 text-xs">
                  <p className="font-medium">{line.name}</p>
                  <p className="text-muted-foreground">
                    Required {line.requiredQuantity} {line.unit} · Lot {line.lotCode} · Used{" "}
                    {line.quantityUsed === "NOT_RECORDED" ? "NOT_RECORDED" : `${line.quantityUsed} ${line.unit}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Quality state" className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Quality</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="Status" value={qualityLabel[row.qualityStatus]} />
            <Metric label="Hold reason" value={row.holdReason ?? "—"} />
            <Metric label="Review owner" value={row.reviewOwnerName ?? "—"} />
            <Metric label="Last action" value={row.lastQualityAction ?? "—"} />
            <Metric label="Last action at" value={formatDay(row.lastQualityActionAt)} />
            <Metric label="Actor" value={row.lastQualityActionByName ?? "—"} />
          </dl>
        </section>

        <section aria-label="Batch timeline" className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Timeline</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="Batch created" value={formatDay(row.createdAt)} />
            <Metric label="Production started" value={formatDay(row.productionStartedAt)} />
            <Metric label="Production completed" value={formatDay(row.productionCompletedAt)} />
          </dl>
          {row.qualityEvents.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-xs">
              {row.qualityEvents.map((event) => (
                <li key={event.id} className="flex justify-between gap-2">
                  <span>
                    {event.action}
                    {event.reason ? ` · ${event.reason}` : ""}
                  </span>
                  <span className="text-muted-foreground">{formatDay(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {(row.canHold || row.canRelease || row.canReject) && canQualityAction ? (
          <section aria-label="Quality actions" className="border-t border-border pt-3">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Actions</p>
            {row.canHold ? (
              <label className="mt-2 block text-xs">
                <span className="text-muted-foreground">Hold reason</span>
                <select
                  className="mt-1 h-10 w-full rounded-sm border border-input bg-transparent px-2 text-sm"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                >
                  {HOLD_REASON_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {row.canHold ? (
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => mutate("hold")}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : "Place on hold"}
                </Button>
              ) : null}
              {row.canRelease ? (
                <Button type="button" size="sm" disabled={pending} onClick={() => mutate("release")}>
                  Release batch
                </Button>
              ) : null}
              {row.canReject ? (
                <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => mutate("reject")}>
                  Reject batch
                </Button>
              ) : null}
              <Button asChild size="sm" variant="outline">
                <Link href={`/operations?order=${row.productionOrderId}`}>Open production order</Link>
              </Button>
            </div>
            {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
            {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Quality decisions are explicit user actions. Pharmora does not auto-release batches or post inventory.
            </p>
          </section>
        ) : null}
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
