"use client";

import Link from "next/link";

import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toneByStatus } from "@/components/suppliers/supplier-display";
import { StatusBadge } from "@/components/ds/status-badge";
import type { SupplierDetail } from "@/lib/suppliers/types";

export function SupplierDetailSheet({ row, compact = false }: { row: SupplierDetail; compact?: boolean }) {
  const materials = compact ? row.materials.slice(0, 5) : row.materials;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{row.name}</SheetTitle>
        <SheetDescription>{row.code}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6 text-sm">
        <StatusBadge tone={toneByStatus[row.status] ?? "neutral"}>{row.status}</StatusBadge>

        <section>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Material coverage</p>
          <p className="mt-2 text-muted-foreground">
            {row.materials.length} materials · {row.materials.filter((item) => item.preferred).length} preferred
          </p>
          <ul className="mt-2 space-y-2">
            {materials.map((item) => (
              <li key={`${item.productId}-${item.sku}`} className="rounded-lg border border-border px-3 py-2">
                <p className="font-medium">
                  {item.name} <span className="text-xs text-muted-foreground">({item.sku})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Lead: {item.leadTimeDays !== null ? `${item.leadTimeDays}d` : "—"} · MOQ:{" "}
                  {item.minimumOrderQuantity !== null ? item.minimumOrderQuantity.toLocaleString("en-KE") : "—"}
                </p>
                {item.preferred ? <p className="mt-1 text-xs text-success">Preferred</p> : null}
                {!compact ? (
                  <Link href={`/procurement?material=${item.productId}`} className="mt-1 inline-block text-xs hover:underline">
                    Compare from procurement
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          {compact && row.materials.length > materials.length ? (
            <p className="mt-2 text-xs text-muted-foreground">+{row.materials.length - materials.length} more in advanced layout</p>
          ) : null}
        </section>

        {!compact ? (
          <>
            <section className="border-t border-border pt-3">
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Commercial data</p>
              <p className="mt-2 text-muted-foreground">
                Known prices: {row.knownPrices} · Lead-time records: {row.leadTimeKnown}
              </p>
            </section>
            <section className="border-t border-border pt-3">
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Performance</p>
              <p className="mt-2 text-muted-foreground">
                {row.performanceAvailable ? "Historical performance available." : "Historical performance data not available."}
              </p>
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
