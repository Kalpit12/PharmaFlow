"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/ds/empty-state";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import {
  PURCHASE_ORDER_VIEWS,
  type PurchaseOrderListSnapshot,
  type PurchaseOrderStatus,
  type PurchaseOrderViewId,
} from "@/lib/purchase-orders/types";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<PurchaseOrderViewId, string> = {
  all: "All",
  draft: "Drafts",
  pending: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const statusTone: Record<PurchaseOrderStatus, StatusTone> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "neutral",
  CANCELLED: "neutral",
  CLOSED: "neutral",
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function PoWorkspace({ data }: { data: PurchaseOrderListSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") as PurchaseOrderViewId) || data.view;
  const query = searchParams.get("q") ?? "";

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter(
      (row) =>
        row.poNumber.toLowerCase().includes(q) ||
        row.supplierName.toLowerCase().includes(q) ||
        (row.rfqReference?.toLowerCase().includes(q) ?? false)
    );
  }, [data.rows, query]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {PURCHASE_ORDER_VIEWS.map((id) => (
          <Button key={id} asChild size="xs" variant={view === id ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
            <Link href={href({ view: id === "all" ? undefined : id })}>{VIEW_LABEL[id]}</Link>
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="rounded-lg border border-border/80 px-3 py-2">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      <SearchInput
        className="w-full sm:max-w-xs"
        placeholder="Search PO, supplier, RFQ…"
        defaultValue={query}
        aria-label="Search purchase orders"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            router.push(href({ q: event.currentTarget.value || undefined }));
          }
        }}
      />

      {filtered.length === 0 ? (
        <EmptyState title="No purchase orders" description={data.emptyReason ?? "Adjust filters or create from an awarded RFQ."} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">PO</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">RFQ</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <Link href={`/purchase-orders/${row.id}`} className="font-medium hover:underline">
                      {row.poNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{row.supplierName}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.rfqReference ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.totalLabel}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={statusTone[row.status]}>{row.status.replaceAll("_", " ")}</StatusBadge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatDay(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {data.planningNote}{" "}
        <Link href="/supplier-performance" className="font-medium text-foreground hover:underline">
          View supplier performance
        </Link>
      </p>
    </div>
  );
}
