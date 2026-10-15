"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatGanttDateOnly, formatGanttDateTime } from "@/lib/operations/gantt-format";
import type { GanttOrderTableRow } from "@/lib/server/operations-gantt";
import { cn } from "@/lib/utils";

type TabKey = "unscheduled" | "scheduled" | "late" | "error";

export function GanttOrderBottomPanel({
  rows,
  selectedOrderId,
  showCapacity,
  onToggleCapacity,
  onSelectOrder,
  canSchedule,
  onScheduleUnscheduled,
  pending,
  lateJobCount,
}: {
  rows: GanttOrderTableRow[];
  selectedOrderId: string | null;
  showCapacity: boolean;
  onToggleCapacity: () => void;
  onSelectOrder: (orderId: string, operationId: string) => void;
  canSchedule: boolean;
  onScheduleUnscheduled: () => void;
  pending: boolean;
  lateJobCount: number;
}) {
  const [tab, setTab] = useState<TabKey>("unscheduled");
  const [filter, setFilter] = useState("");

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { unscheduled: 0, scheduled: 0, late: 0, error: 0 };
    for (const row of rows) c[row.tab] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((row) => {
      if (row.tab !== tab) return false;
      if (!q) return true;
      return (
        row.batchLabel.toLowerCase().includes(q) ||
        row.orderNumber.toLowerCase().includes(q) ||
        row.productName.toLowerCase().includes(q)
      );
    });
  }, [filter, rows, tab]);

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "unscheduled", label: "Unscheduled", count: counts.unscheduled },
    { key: "scheduled", label: "Scheduled" },
    { key: "late", label: "Late", count: lateJobCount },
    { key: "error", label: "Errors", count: counts.error },
  ];

  return (
    <div className="flex min-h-[120px] flex-col border-t border-border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={cn(
              "rounded px-2 py-1 text-xs font-medium",
              tab === t.key ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
            )}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count != null && t.count > 0 ? ` (${t.count})` : ""}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            className="h-7 w-40 text-xs"
            placeholder="Filter table…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          {canSchedule ? (
            <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" disabled={pending} onClick={onScheduleUnscheduled}>
              Schedule unscheduled
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={showCapacity ? "secondary" : "outline"}
            className="h-7 text-xs"
            onClick={onToggleCapacity}
          >
            Capacity
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[960px] text-left text-xs">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-2 py-1.5 font-medium">Batch</th>
              <th className="px-2 py-1.5 font-medium">Order</th>
              <th className="px-2 py-1.5 font-medium">Step</th>
              <th className="px-2 py-1.5 font-medium">Product</th>
              <th className="px-2 py-1.5 font-medium">Duration (h)</th>
              <th className="px-2 py-1.5 font-medium">Qty</th>
              <th className="px-2 py-1.5 font-medium">Begin</th>
              <th className="px-2 py-1.5 font-medium">End</th>
              <th className="px-2 py-1.5 font-medium">Due</th>
              <th className="px-2 py-1.5 font-medium">Customer</th>
              {(tab === "unscheduled" || tab === "error") && <th className="px-2 py-1.5 font-medium">Reason</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.operationId}
                className={cn(
                  "cursor-pointer border-b border-border/50 hover:bg-muted/40",
                  selectedOrderId === row.orderId && "bg-[color-mix(in_srgb,var(--planner-select-orange)_12%,transparent)]"
                )}
                onClick={() => onSelectOrder(row.orderId, row.operationId)}
              >
                <td className="px-2 py-1 font-mono">{row.batchLabel}</td>
                <td className="px-2 py-1 font-mono">{row.orderNumber}</td>
                <td className="px-2 py-1">{row.stepName}</td>
                <td className="max-w-[10rem] truncate px-2 py-1">{row.productName}</td>
                <td className="px-2 py-1 tabular-nums">{row.durationHours.toFixed(2)}</td>
                <td className="px-2 py-1 tabular-nums">{row.quantity.toLocaleString("en-GB")}</td>
                <td className="px-2 py-1 whitespace-nowrap">{row.begin ? formatGanttDateTime(row.begin) : "—"}</td>
                <td className="px-2 py-1 whitespace-nowrap">{row.end ? formatGanttDateTime(row.end) : "—"}</td>
                <td className="px-2 py-1 whitespace-nowrap">{formatGanttDateOnly(row.dueDate)}</td>
                <td className="px-2 py-1">{row.customer ?? "—"}</td>
                {(tab === "unscheduled" || tab === "error") && (
                  <td className="max-w-[14rem] truncate px-2 py-1 text-muted-foreground" title={row.reason ?? undefined}>
                    {row.reason ?? "—"}
                  </td>
                )}
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-2 py-6 text-center text-muted-foreground">
                  No rows in this tab.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
