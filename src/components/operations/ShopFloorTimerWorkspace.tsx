"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExecutionOrderRow, ProductionExecutionSnapshot } from "@/lib/production-execution/types";
import { filterOpenStationJobs, sortStationQueue } from "@/lib/production-execution/shop-floor";
import { cn } from "@/lib/utils";

function elapsedLabel(iso: string | null, nowMs: number): string {
  if (!iso) return "0:00";
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return "0:00";
  const total = Math.max(0, Math.floor((nowMs - start) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ShopFloorTimerWorkspace({ data }: { data: ProductionExecutionSnapshot }) {
  const [workstationId, setWorkstationId] = useState<string | null>(data.workstationId);
  const [operatorId, setOperatorId] = useState(data.currentUser.id ?? data.operators[0]?.id ?? "");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [stopOpen, setStopOpen] = useState(false);
  const [qtyGood, setQtyGood] = useState("");
  const [qtyScrap, setQtyScrap] = useState("0");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const stations = data.workstations;
  const queue = useMemo(() => {
    if (!workstationId) return [];
    return sortStationQueue(
      filterOpenStationJobs(data.orders.filter((row) => row.workstationId === workstationId))
    );
  }, [data.orders, workstationId]);
  const current = queue[0] ?? null;
  const upcoming = queue.slice(1, 4);
  const operatorName =
    data.operators.find((row) => row.id === operatorId)?.name ?? data.currentUser.name ?? "Operator";

  const run = (path: string, body: Record<string, unknown> = {}) => {
    if (!current) return;
    startTransition(async () => {
      setError(null);
      const response = await fetch(`/api/production-orders/${current.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, reason: body.reason ?? operatorName }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setError(payload.message ?? "Action failed.");
        return;
      }
      setStopOpen(false);
      window.location.reload();
    });
  };

  if (!workstationId) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Shop floor timer</p>
          <h1 className="text-2xl font-semibold tracking-tight">Pick a workstation</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tablet view — current job, queue, and Start / Stop.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((station) => {
            const count = data.orders.filter(
              (row) => row.workstationId === station.id && row.executionState !== "COMPLETED"
            ).length;
            const running = data.orders.some(
              (row) => row.workstationId === station.id && row.executionState === "IN_PROGRESS"
            );
            return (
              <li key={station.id}>
                <button
                  type="button"
                  className="flex min-h-24 w-full flex-col items-start justify-center rounded-xl border border-border bg-card px-4 py-4 text-left shadow-sm transition hover:border-foreground/30 hover:bg-muted/40"
                  onClick={() => setWorkstationId(station.id)}
                >
                  <span className="text-base font-semibold">{station.name}</span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    {running ? "Job running" : `${count} in queue`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const stationName = stations.find((row) => row.id === workstationId)?.name ?? "Station";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Timer</p>
          <h1 className="text-2xl font-semibold tracking-tight">{stationName}</h1>
        </div>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setWorkstationId(null)}>
          Change station
        </Button>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Operator
        <select
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          value={operatorId}
          onChange={(event) => setOperatorId(event.target.value)}
        >
          {data.currentUser.name ? (
            <option value={data.currentUser.id ?? ""}>{data.currentUser.name} (you)</option>
          ) : null}
          {data.operators
            .filter((row) => row.id !== data.currentUser.id)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
        </select>
      </label>

      {current ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <StatusBadge tone={current.executionState === "IN_PROGRESS" ? "primary" : "neutral"}>
                {current.activeOperationLabel ?? current.executionState.replace(/_/g, " ")}
              </StatusBadge>
              <p className="mt-2 text-xl font-semibold">{current.orderNumber}</p>
              <p className="text-sm text-muted-foreground">{current.productName}</p>
              <p className="mt-1 text-sm">
                {current.activeOperationLabel}
                {current.batchNumber ? ` · ${current.batchNumber}` : ""}
              </p>
            </div>
            <p className="font-mono text-4xl tabular-nums tracking-tight">
              {elapsedLabel(current.actualStart ?? current.shopFloorEvents.find((row) => row.eventType === "START")?.recordedAt ?? null, nowMs)}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {current.canStart ? (
              <BigAction label="Start" disabled={pending} onClick={() => run("start")} />
            ) : null}
            {current.canPause ? (
              <BigAction label="Pause" variant="secondary" disabled={pending} onClick={() => run("pause")} />
            ) : null}
            {current.canResume ? (
              <BigAction label="Resume" disabled={pending} onClick={() => run("resume")} />
            ) : null}
            {current.canQaRelease ? (
              <BigAction
                label="QA release"
                disabled={pending}
                onClick={() => {
                  const signature = window.prompt("Type your name to e-sign this QA release", operatorName);
                  if (!signature || signature.trim().length < 3) {
                    setError("A signed name is required for QA release.");
                    return;
                  }
                  run("qa-release", { signature: signature.trim() });
                }}
              />
            ) : null}
            {current.canComplete || current.executionState === "IN_PROGRESS" || current.executionState === "PAUSED" ? (
              <BigAction label="Stop" variant="danger" disabled={pending} onClick={() => {
                setQtyGood(String(current.producedQuantity ?? current.plannedQuantity));
                setStopOpen(true);
              }} />
            ) : null}
          </div>
          {pending ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Saving…
            </p>
          ) : null}
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          No open jobs on this workstation.
        </p>
      )}

      {stopOpen && current ? (
        <section className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium">Stop {current.orderNumber}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Qty good
              <Input className="mt-1 h-12 text-base" inputMode="numeric" value={qtyGood} onChange={(e) => setQtyGood(e.target.value)} />
            </label>
            <label className="text-sm font-medium">
              Qty scrap
              <Input className="mt-1 h-12 text-base" inputMode="numeric" value={qtyScrap} onChange={(e) => setQtyScrap(e.target.value)} />
            </label>
          </div>
          <label className="mt-3 block text-sm font-medium">
            Note (optional)
            <Input className="mt-1 h-12 text-base" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="mt-4 flex gap-2">
            <Button type="button" className="min-h-12 flex-1" disabled={pending} onClick={() => run("stop", {
              producedQuantity: Number(qtyGood),
              scrapQuantity: Number(qtyScrap) || 0,
              reason: note.trim() || operatorName,
            })}>
              Confirm stop
            </Button>
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setStopOpen(false)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      <section>
        <p className="text-sm font-medium">Next in queue</p>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No further jobs on this station.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {upcoming.map((row, index) => (
              <QueueRow key={row.id} row={row} index={index + 2} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function BigAction({
  label,
  onClick,
  disabled,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-16 rounded-xl text-base font-semibold shadow-sm transition disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:opacity-90",
        variant === "secondary" && "border border-border bg-background hover:bg-muted",
        variant === "danger" && "bg-destructive text-destructive-foreground hover:opacity-90"
      )}
    >
      {label}
    </button>
  );
}

function QueueRow({ row, index }: { row: ExecutionOrderRow; index: number }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3">
      <div>
        <p className="text-xs text-muted-foreground">#{index}</p>
        <p className="font-medium">{row.orderNumber}</p>
        <p className="text-sm text-muted-foreground">
          {row.activeOperationLabel ?? "Queued"} · {row.productName}
        </p>
      </div>
      <StatusBadge tone="neutral">{row.executionState.replace(/_/g, " ")}</StatusBadge>
    </li>
  );
}
