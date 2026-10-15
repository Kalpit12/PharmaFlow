"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { SHOP_FLOOR_PAUSE_REASONS } from "@/lib/production-execution/shop-floor";
import type { ExecutionOrderRow } from "@/lib/production-execution/types";

const stateLabel = {
  WAITING: "Waiting",
  RELEASED: "Released",
  IN_PROGRESS: "Active",
  PAUSED: "Paused",
  COMPLETED: "Done",
} as const;

export function ShopFloorStationQueue({
  queue,
  canExecute,
  onRefresh,
  onSelect,
}: {
  queue: ExecutionOrderRow[];
  canExecute: boolean;
  onRefresh: () => void;
  onSelect: (orderId: string) => void;
}) {
  if (queue.length === 0) {
    return <p className="text-sm text-muted-foreground">No open jobs on this station.</p>;
  }

  return (
    <ul className="space-y-3">
      {queue.map((row, index) => (
        <ShopFloorQueueCard
          key={row.id}
          row={row}
          index={index}
          canExecute={canExecute}
          onRefresh={onRefresh}
          onSelect={() => onSelect(row.id)}
        />
      ))}
    </ul>
  );
}

function ShopFloorQueueCard({
  row,
  index,
  canExecute,
  onRefresh,
  onSelect,
}: {
  row: ExecutionOrderRow;
  index: number;
  canExecute: boolean;
  onRefresh: () => void;
  onSelect: () => void;
}) {
  const [pauseReason, setPauseReason] = useState<string>(SHOP_FLOOR_PAUSE_REASONS[0].id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (path: string, body: Record<string, unknown> = {}) => {
    startTransition(async () => {
      setError(null);
      const response = await fetch(`/api/production-orders/${row.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setError(payload.message ?? "Action failed.");
        return;
      }
      onRefresh();
    });
  };

  return (
    <li className="rounded-lg border border-border p-3">
      <button type="button" className="w-full text-left" onClick={onSelect}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground">#{index + 1}</p>
            <p className="text-base font-medium">{row.orderNumber}</p>
            <p className="text-sm text-muted-foreground">{row.productName}</p>
          </div>
          <StatusBadge tone={row.executionState === "IN_PROGRESS" ? "intel" : "neutral"}>
            {stateLabel[row.executionState]}
          </StatusBadge>
        </div>
      </button>
      {row.requiresLineClearance && !row.lineClearanceComplete ? (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Line clearance required before start.</p>
      ) : null}
      {canExecute ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {row.canSignLineClearance ? (
            <Button type="button" size="sm" className="min-h-11" disabled={pending} onClick={() => run("line-clearance", {})}>
              Sign line clearance
            </Button>
          ) : null}
          {row.canRelease ? (
            <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={pending} onClick={() => run("release")}>
              Release
            </Button>
          ) : null}
          {row.canStart ? (
            <Button type="button" size="sm" className="min-h-11" disabled={pending} onClick={() => run("start")}>
              Start
            </Button>
          ) : null}
          {row.canPause ? (
            <>
              <select
                className="min-h-11 rounded-md border border-input bg-background px-2 text-sm"
                value={pauseReason}
                onChange={(event) => setPauseReason(event.target.value)}
              >
                {SHOP_FLOOR_PAUSE_REASONS.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {reason.label}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={pending} onClick={() => run("pause", { reason: pauseReason })}>
                Pause
              </Button>
            </>
          ) : null}
          {row.canResume ? (
            <Button type="button" size="sm" className="min-h-11" disabled={pending} onClick={() => run("resume")}>
              Resume
            </Button>
          ) : null}
          {row.canComplete ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-11"
              disabled={pending}
              onClick={() => run("complete", { producedQuantity: row.producedQuantity ?? row.plannedQuantity })}
            >
              Complete
            </Button>
          ) : null}
          {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </li>
  );
}
