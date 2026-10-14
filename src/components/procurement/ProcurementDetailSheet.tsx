"use client";

import Link from "next/link";

import {
  formatDay,
  formatQty,
  riskTone,
  rowStatusLabel,
  rowStatusTone,
} from "@/components/procurement/procurement-display";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ProcurementRecommendation, ProcurementRequisitionDetail, ProcurementRowStatus } from "@/lib/procurement/types";

export function ProcurementDetailSheet({
  row,
  detail,
  canReview,
  busy,
  error,
  compact = false,
  onCreateDraft,
  onCreateRfq,
  onReview,
}: {
  row: ProcurementRecommendation;
  detail: ProcurementRequisitionDetail | null;
  canReview: boolean;
  busy: boolean;
  error: string | null;
  compact?: boolean;
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

        {active && !compact ? (
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
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Shortage</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="Net requirement" value={formatQty(active?.netRequirement ?? row.netRequirement)} />
            <Metric label="Suggested qty" value={formatQty(row.suggestedQuantity)} />
            {!compact ? (
              <>
                <Metric label="Requirement" value={formatQty(active?.grossRequirement ?? row.grossRequirement)} />
                <Metric label="Available" value={formatQty(active?.available ?? row.available)} />
                <Metric label="Incoming" value={formatQty(active?.incoming ?? row.incoming)} />
                <Metric label="Projected" value={formatQty(active?.projectedAvailable ?? row.projectedAvailable)} />
              </>
            ) : null}
          </dl>
        </section>

        {!compact ? (
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
                      Qty {formatQty(order.requiredQuantity)} · due {formatDay(order.dueDate)}
                    </p>
                    <Link href="/operations" className="mt-1 inline-block text-xs hover:underline">
                      Operations
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Recommendation</p>
          <p className="mt-2 text-muted-foreground">{active?.reason ?? row.reason}</p>
        </section>

        {!compact ? (
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
                          Lead time: {option.leadTimeDays !== null ? `${option.leadTimeDays} days` : "Not available"} · Price:{" "}
                          {option.lastKnownPrice}
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
        ) : (
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
            <Link href={`/suppliers?material=${row.productId}`}>Suppliers</Link>
          </Button>
        )}

        {row.rowStatus === "MONITOR" ? (
          <p className="text-sm text-muted-foreground">Monitor only — no automatic requisition.</p>
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
              ? "Reviewed — no PO is created automatically."
              : "Rejected — cannot be re-reviewed."}
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
