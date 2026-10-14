"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { formatDay, qualityLabel, qualityTone, riskTone } from "@/components/batches/batch-display";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HOLD_REASON_PRESETS, type BatchRow } from "@/lib/batches/types";

export function BatchDetailSheet({
  row,
  canQualityAction,
  compact = false,
  onComplete,
}: {
  row: BatchRow;
  canQualityAction: boolean;
  compact?: boolean;
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

        <section aria-label="Batch quantity">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Quantity</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="Planned" value={`${row.plannedQuantity} ${row.unit}`} />
            <Metric
              label="Produced"
              value={row.producedLabel === "NOT_RECORDED" ? "NOT_RECORDED" : `${row.producedLabel} ${row.unit}`}
            />
            {!compact ? (
              <>
                <Metric
                  label="Remaining"
                  value={row.remainingQuantity == null ? "NOT_RECORDED" : `${row.remainingQuantity} ${row.unit}`}
                />
                <Metric label="Completion" value={row.completionPercent == null ? "NOT_RECORDED" : `${row.completionPercent}%`} />
              </>
            ) : null}
          </dl>
        </section>

        {!compact ? (
          <>
            <section aria-label="Batch identity" className="border-t border-border pt-3">
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Identity</p>
              <dl className="mt-2 grid grid-cols-2 gap-3">
                <Metric label="Batch number" value={row.batchNumber} />
                <Metric label="Product" value={row.productSku} />
                <Metric label="Production order" value={row.orderNumber} />
                <Metric label="Manufacturing" value={row.manufacturingStatus.replace(/_/g, " ")} />
                <Metric label="Quality" value={qualityLabel[row.qualityStatus]} />
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
          </>
        ) : null}

        <section aria-label="Quality state" className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Quality</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="Status" value={qualityLabel[row.qualityStatus]} />
            <Metric label="Hold reason" value={row.holdReason ?? "—"} />
            {!compact ? (
              <>
                <Metric label="Review owner" value={row.reviewOwnerName ?? "—"} />
                <Metric label="Last action" value={row.lastQualityAction ?? "—"} />
                <Metric label="Last action at" value={formatDay(row.lastQualityActionAt)} />
                <Metric label="Actor" value={row.lastQualityActionByName ?? "—"} />
              </>
            ) : null}
          </dl>
        </section>

        {!compact ? (
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
        ) : null}

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
            {!compact ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Quality decisions are explicit user actions. Pharmora does not auto-release batches or post inventory.
              </p>
            ) : null}
          </section>
        ) : (
          <div className="border-t border-border pt-3">
            <Button asChild size="sm" variant="outline">
              <Link href={`/operations?order=${row.productionOrderId}`}>Open production order</Link>
            </Button>
          </div>
        )}
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
