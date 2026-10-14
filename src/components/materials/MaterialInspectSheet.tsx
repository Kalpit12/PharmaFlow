"use client";

import Link from "next/link";

import {
  formatDay,
  formatQty,
  priorityTone,
  riskTone,
  shortageLabel,
  shortageTone,
  statusLabel,
} from "@/components/materials/material-display";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MaterialRequirement } from "@/lib/materials/types";

export function MaterialInspectSheet({ row, compact = false }: { row: MaterialRequirement; compact?: boolean }) {
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
        {!compact ? <p className="text-xs text-muted-foreground">{row.priorityReason}</p> : null}
        {row.attention ? <p className="text-warning">{row.attention}</p> : null}

        <section aria-label="MRP calculation">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {compact ? "Balance" : "Requirement breakdown"}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            {!compact ? (
              <Metric label="Gross requirement" value={`${formatQty(row.grossRequirement)} ${row.unit}`} />
            ) : null}
            <Metric label="On hand" value={`${formatQty(row.onHand)} ${row.unit}`} />
            {!compact ? (
              <>
                <Metric label="Allocated" value={`${formatQty(row.allocated)} ${row.unit}`} />
                <Metric label="Free available" value={`${formatQty(row.freeAvailable)} ${row.unit}`} />
              </>
            ) : null}
            <Metric label="Incoming" value={`${formatQty(row.incoming)} ${row.unit}`} />
            <Metric label="Projected" value={`${formatQty(row.projectedAvailable)} ${row.unit}`} />
            <Metric label="Net requirement" value={`${formatQty(row.netRequirement)} ${row.unit}`} />
            {compact ? null : (
              <Metric label="Shortage quantity" value={row.shortage ? formatQty(row.netRequirement) : "None"} />
            )}
          </dl>
          {!compact ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Net requirement = max(gross − on hand − incoming, 0). Projected available = on hand + incoming − gross.
              Allocated equals open production demand — there is no separate reservation ledger. Free available = on hand −
              allocated.
            </p>
          ) : null}
        </section>

        <section className="border-t border-border pt-3" aria-label="Shortage timing">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Shortage</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Metric label="Status" value={shortageLabel[row.shortageStatus]} />
            <Metric label="Earliest due" value={formatDay(row.earliestDueDate)} />
            {!compact ? (
              <>
                <Metric label="Earliest shortage" value={formatDay(row.earliestShortageDate)} />
                <Metric label="Requirement date" value={formatDay(row.requirementDate)} />
              </>
            ) : null}
          </dl>
        </section>

        {(row.risk === "CRITICAL" || row.risk === "HIGH" || row.risk === "MEDIUM" || row.shortage) && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
              <Link href={row.procurement.hrefProcurement}>Procurement</Link>
            </Button>
            {!compact ? (
              <>
                <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
                  <Link href={row.procurement.hrefRfqs}>RFQs</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
                  <Link href={row.procurement.hrefPurchaseOrders}>Purchase orders</Link>
                </Button>
              </>
            ) : null}
          </div>
        )}

        {!compact ? (
          <>
            <section className="border-t border-border pt-3" aria-label="Procurement linkage">
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Procurement records</p>
              <dl className="mt-2 grid grid-cols-3 gap-3">
                <Metric label="Requisitions" value={String(row.procurement.openRequisitions)} />
                <Metric label="Open RFQs" value={String(row.procurement.openRfqs)} />
                <Metric label="Open POs" value={String(row.procurement.openPurchaseOrders)} />
              </dl>
            </section>
          </>
        ) : null}

        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Affected production</p>
          {row.affectedOrders.length === 0 ? (
            <p className="mt-2 text-muted-foreground">None</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {row.affectedOrders.slice(0, compact ? 4 : undefined).map((order) => (
                <li key={order.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">{order.productName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Required {formatQty(order.requiredQuantity)} · due {formatDay(order.dueDate)}
                  </p>
                  <Link href={`/operations?order=${order.id}`} className="mt-1 inline-block text-xs hover:underline">
                    Operations
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!compact ? (
          <>
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
          </>
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
