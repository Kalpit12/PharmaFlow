"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/ds/empty-state";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { RECEIVING_VIEWS, type ReceivingListSnapshot, type ReceivingViewId } from "@/lib/receiving/types";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<ReceivingViewId, string> = {
  all: "All",
  awaiting: "Awaiting receipt",
  partial: "Partially received",
  complete: "Fully received",
  discrepancy: "Discrepancies",
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function statusTone(status: string): StatusTone {
  if (status === "Fully received") return "intel";
  if (status === "Partially received") return "material";
  return "info";
}

export function ReceivingWorkspace({ data }: { data: ReceivingListSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") as ReceivingViewId) || data.view;
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
    return data.rows.filter((row) => row.poNumber.toLowerCase().includes(q) || row.supplierName.toLowerCase().includes(q));
  }, [data.rows, query]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {RECEIVING_VIEWS.map((id) => (
          <Button key={id} asChild size="xs" variant={view === id ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
            <Link href={href({ view: id === "all" ? undefined : id })}>{VIEW_LABEL[id]}</Link>
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="rounded-lg border border-border/80 px-3 py-2">
            <p className="text-[11px] uppercase text-muted-foreground">{kpi.label}</p>
            <p className="text-lg font-semibold tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      <SearchInput
        placeholder="Search PO or supplier"
        defaultValue={query}
        aria-label="Search receiving"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            router.replace(href({ q: event.currentTarget.value || undefined }));
          }
        }}
      />

      <p className="text-xs text-muted-foreground">
        {data.planningNote}{" "}
        <Link href="/supplier-performance" className="font-medium text-foreground hover:underline">
          View supplier performance
        </Link>
      </p>

      {filtered.length === 0 ? (
        <EmptyState title="No purchase orders to receive" description={data.emptyReason ?? "Adjust filters."} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border/70 bg-muted/30 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">PO</th>
                <th className="px-3 py-2 font-medium">Supplier</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Ordered</th>
                <th className="px-3 py-2 font-medium text-right">Received</th>
                <th className="px-3 py-2 font-medium text-right">Remaining</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <Link href={row.href} className="font-medium hover:underline">
                      {row.poNumber}
                    </Link>
                    {row.hasDiscrepancy ? (
                      <p className="text-[11px] text-material">Discrepancy</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">{row.supplierName}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.orderedQuantity.toLocaleString("en-KE")}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.receivedQuantity.toLocaleString("en-KE")}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{row.remainingQuantity.toLocaleString("en-KE")}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatDay(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
