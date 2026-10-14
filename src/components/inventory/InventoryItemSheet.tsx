"use client";

import Link from "next/link";

import { formatDay, formatQty, healthTone } from "@/components/inventory/inventory-display";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { InventoryItem } from "@/lib/inventory/types";

export function InventoryItemSheet({ item, compact = false }: { item: InventoryItem; compact?: boolean }) {
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
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Status</dt>
          <dd className="mt-0.5">
            <StatusBadge tone={healthTone[item.health]}>{item.health.replace(/_/g, " ")}</StatusBadge>
          </dd>
        </div>
        {!compact ? (
          <>
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Safety stock</dt>
              <dd className="mt-0.5 tabular-nums">{formatQty(item.safetyStock)}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">In transit</dt>
              <dd className="mt-0.5 tabular-nums">{formatQty(item.inTransit)}</dd>
            </div>
          </>
        ) : null}
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
          {item.batches.slice(0, compact ? 4 : undefined).map((batch) => (
            <li key={batch.id} className="text-muted-foreground">
              {batch.batchCode} · {formatQty(batch.quantity)} · {batch.warehouseName}
              {batch.expiryDate ? ` · exp ${formatDay(batch.expiryDate)}` : ""}
            </li>
          ))}
        </ul>
        {!compact ? (
          <>
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
          </>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
              <Link href="/materials">Materials</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
              <Link href={`/inventory?view=health&q=${encodeURIComponent(item.sku)}`}>Advanced detail</Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
