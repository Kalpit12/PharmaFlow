"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { SchedulePlanReviewActions } from "@/components/operations/SchedulePlanReviewActions";
import { StatusBadge } from "@/components/ds/status-badge";
import { ganttBarFillClass, type GanttBarTone } from "@/lib/operations/planner-gantt-colors";
import { ganttBarLayout, ganttLeftPctFromTime, ganttMsFromLeftPct } from "@/lib/operations/gantt-layout";
import type { GanttBar, OperationsGanttSnapshot } from "@/lib/server/operations-gantt";
import { cn } from "@/lib/utils";

const LEGEND: Array<{ tone: GanttBarTone; label: string }> = [
  { tone: "scheduled", label: "Scheduled" },
  { tone: "running", label: "Running" },
  { tone: "prospect", label: "Prospect" },
  { tone: "late", label: "Late / at risk" },
  { tone: "qcHold", label: "QC hold" },
  { tone: "ghost", label: "Proposed (ghost)" },
];

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type DragState = {
  bar: GanttBar;
  pointerId: number;
  trackWidth: number;
  startPointerX: number;
  originLeftPct: number;
  targetWorkstationId: string;
};

export function OperationsGanttWorkspace({ data }: { data: OperationsGanttSnapshot }) {
  const router = useRouter();
  const [showGhost, setShowGhost] = useState(Boolean(data.proposal?.status === "PROPOSED"));
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragOffsetPct, setDragOffsetPct] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trackRefs = useRef(new Map<string, HTMLDivElement>());

  const windowStart = useMemo(() => new Date(data.window.start), [data.window.start]);
  const windowEnd = useMemo(() => new Date(data.window.end), [data.window.end]);
  const canSchedule = data.capabilities.canSchedule;

  const liveBars = useMemo(() => data.bars.filter((row) => row.layer === "live"), [data.bars]);
  const ghostBars = useMemo(() => data.bars.filter((row) => row.layer === "ghost"), [data.bars]);

  const nowPct = useMemo(() => {
    const now = Date.now();
    if (now < windowStart.getTime() || now > windowEnd.getTime()) return null;
    return ganttLeftPctFromTime(new Date(now), windowStart, windowEnd);
  }, [windowStart, windowEnd]);

  const ticks = useMemo(() => {
    const points: string[] = [];
    const cursor = new Date(windowStart);
    while (cursor.getTime() < windowEnd.getTime()) {
      points.push(cursor.toISOString());
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return points.slice(0, 14);
  }, [windowStart, windowEnd]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      const deltaPx = event.clientX - drag.startPointerX;
      setDragOffsetPct((deltaPx / drag.trackWidth) * 100);
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      const deltaPx = event.clientX - drag.startPointerX;
      const deltaPct = (deltaPx / drag.trackWidth) * 100;
      const nextLeft = drag.originLeftPct + deltaPct;
      const proposedStart = new Date(ganttMsFromLeftPct(nextLeft, windowStart, windowEnd)).toISOString();

      let workstationId = drag.targetWorkstationId;
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const row = el?.closest("[data-gantt-workstation-id]") as HTMLElement | null;
      if (row?.dataset.ganttWorkstationId) {
        workstationId = row.dataset.ganttWorkstationId;
      }

      if (!drag.bar.qualifiedWorkstationIds.includes(workstationId)) {
        setMessage("Target line is not qualified for this order.");
        setDrag(null);
        setDragOffsetPct(0);
        return;
      }

      setDrag(null);
      setDragOffsetPct(0);

      startTransition(async () => {
        setMessage(null);
        const response = await fetch("/api/schedule-plans/propose-move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: drag.bar.orderId,
            workstationId,
            proposedStart,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
          setMessage(payload.message ?? "Move could not be proposed.");
          return;
        }
        setMessage("Move proposed — review ghost bars, then accept.");
        router.refresh();
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, router, windowEnd, windowStart]);

  const beginDrag = (bar: GanttBar, workstationId: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (!canSchedule || !bar.isOrderAnchor || bar.isLocked || pending) return;
    const track = trackRefs.current.get(workstationId);
    if (!track) return;
    const layout = ganttBarLayout(bar.start, bar.end, windowStart, windowEnd);
    if (!layout) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      bar,
      pointerId: event.pointerId,
      trackWidth: track.getBoundingClientRect().width,
      startPointerX: event.clientX,
      originLeftPct: layout.leftPct,
      targetWorkstationId: workstationId,
    });
    setDragOffsetPct(0);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="work-surface p-4">
        <p className="text-sm text-muted-foreground">
          Drag the first operation bar on an order to another time or qualified line — that creates a new proposal (ghost
          overlay). Accept or reject when ready. Shop floor timers live on{" "}
          <Link href="/execution/production" className="text-primary underline-offset-2 hover:underline">
            Production Execution
          </Link>
          .
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <SchedulePlanReviewActions proposal={data.proposal} canSchedule={canSchedule} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showGhost} onChange={(event) => setShowGhost(event.target.checked)} />
            Show ghost proposal
          </label>
          {data.proposal ? (
            <StatusBadge tone="intel">{data.proposal.name}</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">No open proposal</StatusBadge>
          )}
        </div>
        {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
        <ul className="mt-3 flex flex-wrap gap-2">
          {LEGEND.map((item) => (
            <li key={item.tone} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("inline-block h-2.5 w-5 rounded-sm", ganttBarFillClass[item.tone])} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
      </section>

      <div className="work-surface min-w-0 overflow-x-auto">
        <div className="min-w-[960px] p-3">
          <div className="grid grid-cols-[140px_1fr] border-b border-border pb-2 text-xs text-muted-foreground">
            <div>Workstation</div>
            <div className="relative h-6">
              {ticks.map((tick) => {
                const layout = ganttBarLayout(tick, tick, windowStart, windowEnd);
                if (!layout) return null;
                return (
                  <span
                    key={tick}
                    className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${layout.leftPct}%` }}
                  >
                    {formatDay(tick)}
                  </span>
                );
              })}
            </div>
          </div>

          {data.workstations.map((ws) => {
            const rowLive = liveBars.filter((bar) => bar.workstationId === ws.id);
            const rowGhost = showGhost ? ghostBars.filter((bar) => bar.workstationId === ws.id) : [];
            return (
              <div key={ws.id} className="grid grid-cols-[140px_1fr] border-b border-border/60 py-2">
                <div className="pr-2 text-sm">
                  <div className="font-medium">{ws.code}</div>
                  <div className="text-xs text-muted-foreground">{ws.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{Math.round(ws.utilization)}% load</div>
                  <Link
                    href={`/execution/production?workstation=${ws.id}`}
                    className="mt-1 inline-block text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Shop floor queue
                  </Link>
                </div>
                <div
                  ref={(node) => {
                    if (node) trackRefs.current.set(ws.id, node);
                  }}
                  data-gantt-workstation-id={ws.id}
                  className="relative h-14 rounded-sm bg-muted/30"
                >
                  {nowPct != null ? (
                    <div
                      className="pointer-events-none absolute top-0 z-30 h-full w-px bg-chart-3"
                      style={{ left: `${nowPct}%` }}
                      aria-hidden
                    />
                  ) : null}
                  {rowLive.map((bar) => {
                    const layout = ganttBarLayout(bar.start, bar.end, windowStart, windowEnd);
                    if (!layout) return null;
                    const isDragging = drag?.bar.id === bar.id;
                    const left = isDragging ? layout.leftPct + dragOffsetPct : layout.leftPct;
                    const draggable = canSchedule && bar.isOrderAnchor && !bar.isLocked;
                    return (
                      <div
                        key={bar.id}
                        role={draggable ? "button" : undefined}
                        tabIndex={draggable ? 0 : undefined}
                        onPointerDown={(event) => beginDrag(bar, ws.id, event)}
                        title={`${bar.label} · ${formatDay(bar.start)} – ${formatDay(bar.end)}${draggable ? " · drag to propose move" : ""}`}
                        className={cn(
                          "absolute top-2 z-10 h-4 overflow-hidden rounded-sm px-1 text-[10px] leading-4 text-white",
                          ganttBarFillClass[bar.tone as GanttBarTone],
                          draggable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-default",
                          isDragging && "ring-2 ring-chart-3"
                        )}
                        style={{ left: `${left}%`, width: `${Math.max(layout.widthPct, 0.6)}%` }}
                      >
                        <span className="truncate">{bar.label}</span>
                      </div>
                    );
                  })}
                  {rowGhost.map((bar) => {
                    const layout = ganttBarLayout(bar.start, bar.end, windowStart, windowEnd);
                    if (!layout) return null;
                    return (
                      <div
                        key={bar.id}
                        title={`Ghost · ${bar.label}`}
                        className={cn(
                          "absolute top-8 z-20 h-3 overflow-hidden rounded-sm px-1 text-[10px] leading-3",
                          ganttBarFillClass.ghost
                        )}
                        style={{ left: `${layout.leftPct}%`, width: `${Math.max(layout.widthPct, 0.6)}%` }}
                      />
                    );
                  })}
                  <div
                    className="pointer-events-none absolute bottom-0 left-0 h-1 rounded-full bg-chart-2/70"
                    style={{ width: `${Math.min(100, ws.utilization)}%` }}
                    aria-hidden
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {data.diff.length > 0 ? (
        <section className="work-surface overflow-x-auto p-4">
          <h3 className="text-sm font-medium">Proposal diff</h3>
          <table className="mt-3 w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Order</th>
                <th className="py-2 pr-3 font-medium">Previous end</th>
                <th className="py-2 pr-3 font-medium">Proposed end</th>
                <th className="py-2 pr-3 font-medium">Δ minutes</th>
                <th className="py-2 font-medium">Material</th>
              </tr>
            </thead>
            <tbody>
              {data.diff.map((row) => (
                <tr key={row.orderNumber} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-mono text-xs">{row.orderNumber}</td>
                  <td className="py-2 pr-3">{row.previousEnd ? formatDay(row.previousEnd) : "—"}</td>
                  <td className="py-2 pr-3">{row.proposedEnd ? formatDay(row.proposedEnd) : "—"}</td>
                  <td className="py-2 pr-3">{row.changeMinutes}</td>
                  <td className="py-2">{row.materialState}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
