"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";

import { PLANT_TIME_ZONE } from "@/lib/operations/plant-time";
import { readPauseReason } from "@/lib/production-execution/pause-reasons";
import { filterOpenStationJobs, sortStationQueue } from "@/lib/production-execution/shop-floor";
import type { ExecutionOrderRow } from "@/lib/production-execution/types";
import type { ShopFloorBoardSnapshot, ShopFloorBoardStation } from "@/lib/server/shop-floor-board";
import { cn } from "@/lib/utils";

const REFRESH_MS = 30_000;

type TileState = "RUNNING" | "PAUSED" | "QA" | "DOWN" | "READY" | "IDLE";

const STATE_LABEL: Record<TileState, string> = {
  RUNNING: "Running",
  PAUSED: "Paused",
  QA: "QA hold",
  DOWN: "Down",
  READY: "Ready",
  IDLE: "Idle",
};

const STATE_CLASS: Record<TileState, string> = {
  RUNNING: "border-success/50 bg-success/10",
  PAUSED: "border-warning/60 bg-warning/15",
  QA: "border-intel/40 bg-intel/10",
  DOWN: "border-danger/60 bg-danger/10",
  READY: "border-border bg-card",
  IDLE: "border-border bg-muted/40",
};

const DOT_CLASS: Record<TileState, string> = {
  RUNNING: "bg-success",
  PAUSED: "bg-warning",
  QA: "bg-intel",
  DOWN: "bg-danger",
  READY: "bg-primary",
  IDLE: "bg-muted-foreground/40",
};

function elapsed(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 60_000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
}

function tileFor(station: ShopFloorBoardStation, current: ExecutionOrderRow | null): TileState {
  if (current?.isPaused) return "PAUSED";
  if (current?.executionState === "IN_PROGRESS") return current.canQaRelease ? "QA" : "RUNNING";
  if (station.exceptionClosed || (station.exceptionReason?.startsWith("Breakdown") ?? false)) return "DOWN";
  if (current) return "READY";
  return "IDLE";
}

export function ShopFloorBoardWorkspace({ data }: { data: ShopFloorBoardSnapshot }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 15_000);
    const refresh = window.setInterval(() => router.refresh(), REFRESH_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(refresh);
    };
  }, [router]);

  const tiles = useMemo(() => {
    return data.stations.map((station) => {
      const queue = sortStationQueue(
        filterOpenStationJobs(data.execution.orders.filter((row) => row.workstationId === station.id))
      );
      const current = queue[0] ?? null;
      return { station, current, next: queue[1] ?? null, queueLength: queue.length, state: tileFor(station, current) };
    });
  }, [data]);

  const departments = useMemo(() => {
    const map = new Map<string, typeof tiles>();
    for (const tile of tiles) map.set(tile.station.department, [...(map.get(tile.station.department) ?? []), tile]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tiles]);

  const counts = useMemo(() => {
    const c: Record<TileState, number> = { RUNNING: 0, PAUSED: 0, QA: 0, DOWN: 0, READY: 0, IDLE: 0 };
    for (const tile of tiles) c[tile.state] += 1;
    return c;
  }, [tiles]);

  const clock = new Date(nowMs).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: PLANT_TIME_ZONE,
  });
  const updated = new Date(data.asOf).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: PLANT_TIME_ZONE,
  });

  return (
    <div ref={rootRef} className="min-h-full w-full overflow-auto bg-background p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Shop floor · live board</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Plant status</h1>
          <p className="mt-1 text-xs text-muted-foreground">Read-only · refreshes every 30 s · updated {updated} EAT</p>
        </div>
        <div className="flex items-center gap-4">
          <p className="font-mono text-4xl tabular-nums sm:text-5xl">{clock}</p>
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-lg border border-border hover:bg-muted"
            aria-label="Full screen"
            onClick={() => {
              const el = rootRef.current;
              if (!el) return;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void el.requestFullscreen?.();
            }}
          >
            <Maximize2 className="size-5" />
          </button>
        </div>
      </header>

      <ul className="mt-5 flex flex-wrap gap-2">
        {(Object.keys(STATE_LABEL) as TileState[]).map((state) => (
          <li key={state} className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
            <span className={cn("size-2.5 rounded-full", DOT_CLASS[state])} />
            {STATE_LABEL[state]}
            <span className="font-semibold tabular-nums">{counts[state]}</span>
          </li>
        ))}
      </ul>

      {departments.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          No active workstations in your departments.
        </p>
      ) : null}

      {departments.map(([department, rows]) => (
        <section key={department} className="mt-6">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{department}</h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map(({ station, current, next, queueLength, state }) => {
              const pause = state === "PAUSED"
                ? readPauseReason([...(current?.shopFloorEvents ?? [])].reverse().find((row) => row.eventType === "PAUSE")?.reason)
                : null;
              const startedAt =
                current?.actualStart ?? current?.shopFloorEvents.find((row) => row.eventType === "START")?.recordedAt ?? null;
              return (
                <li key={station.id} className={cn("flex min-h-36 flex-col rounded-xl border p-4", STATE_CLASS[state])}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-semibold leading-tight">{station.name}</p>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase">
                      <span className={cn("size-2.5 rounded-full", DOT_CLASS[state])} />
                      {STATE_LABEL[state]}
                    </span>
                  </div>
                  {current && state !== "IDLE" ? (
                    <div className="mt-2 min-w-0">
                      <p className="truncate text-lg font-semibold">{current.orderNumber}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {current.activeOperationLabel ?? "Queued"} · {current.productName}
                      </p>
                      {state === "RUNNING" || state === "QA" ? (
                        <p className="mt-1 text-sm tabular-nums">
                          {elapsed(startedAt, nowMs)} elapsed
                          {current.progressPercent != null ? ` · ${current.progressPercent}%` : ""}
                        </p>
                      ) : null}
                      {pause ? (
                        <p className="mt-1 text-sm font-medium text-warning-foreground">
                          {pause.label}
                          {pause.note ? ` — ${pause.note}` : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No job on station.</p>
                  )}
                  {state === "DOWN" && station.exceptionReason ? (
                    <p className="mt-1 text-sm font-medium text-danger">{station.exceptionReason}</p>
                  ) : null}
                  <p className="mt-auto pt-2 text-xs text-muted-foreground">
                    {next ? `Next: ${next.orderNumber} · ${next.productName}` : queueLength > 0 ? "Last job in queue" : "Queue empty"}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
