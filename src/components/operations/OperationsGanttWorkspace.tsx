"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { GanttOrderBottomPanel } from "@/components/operations/GanttOrderBottomPanel";
import { GanttPlannerToolbar } from "@/components/operations/GanttPlannerToolbar";
import { GanttReschedulePill } from "@/components/operations/GanttReschedulePill";
import { PlannerGlobalRulesDrawer } from "@/components/operations/PlannerGlobalRulesDrawer";
import { ganttBarFillClass, ganttBarSelectedClass, type GanttBarTone } from "@/lib/operations/planner-gantt-colors";
import {
  formatGanttDateOnly,
  formatGanttDateTimeCompact,
  formatOperationStatusLabel,
} from "@/lib/operations/gantt-format";
import { formatGanttNowLabel } from "@/lib/operations/gantt-now";
import { formatDurationHuman } from "@/lib/operations/gantt-shift-segments";
import { buildGanttHeaderTiers, filterHeaderHoursBySpacing } from "@/lib/operations/gantt-window";
import {
  ganttBarLayout,
  ganttLeftPctFromTime,
  ganttMsFromLeftPct,
  ganttPctForStyle,
} from "@/lib/operations/gantt-layout";
import type { GanttBar, OperationsGanttSnapshot } from "@/lib/server/operations-gantt";
import { cn } from "@/lib/utils";

const MIN_BAR_PX = 4;
const MIN_LABEL_PX = 40;
const ROW_GAP = 4;
const ROW_HEIGHT = 34;
const GROUP_HEIGHT = 24;
const LABEL_WIDTH = 160;
const BAR_HEIGHT = 26;
const BAR_TOP = (ROW_HEIGHT - BAR_HEIGHT) / 2;
const DEFAULT_BOTTOM_PCT = 30;

function formatTooltip(bar: GanttBar, wsCode: string): string {
  return [
    `Batch: ${bar.batchLabel}`,
    `Product: ${bar.productName}`,
    `Step: ${bar.operationName}`,
    `Workstation: ${wsCode}`,
    `Start: ${formatGanttDateTimeCompact(bar.start)}`,
    `End: ${formatGanttDateTimeCompact(bar.end)}`,
    `Duration: ${formatDurationHuman(bar.durationMinutes + bar.changeoverMinutes)}`,
    `Order: ${bar.orderNumber}`,
    `Due: ${formatGanttDateOnly(bar.dueDate)}`,
    `Status: ${formatOperationStatusLabel(bar.status)}`,
  ].join("\n");
}

function barHasWarning(bar: GanttBar): boolean {
  const tone = bar.tone as GanttBarTone;
  return tone === "late" || tone === "qcHold";
}

type DragState = {
  bar: GanttBar;
  pointerId: number;
  trackWidth: number;
  startPointerX: number;
  originLeftPct: number;
  targetWorkstationId: string;
};

type ContextMenuState = { bar: GanttBar; x: number; y: number } | null;

export function OperationsGanttWorkspace({
  data,
  canGlobalRules,
}: {
  data: OperationsGanttSnapshot;
  canGlobalRules: boolean;
}) {
  const flowMarkerId = useId().replace(/:/g, "");
  const router = useRouter();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragOffsetPct, setDragOffsetPct] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [pending, startTransition] = useTransition();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [workstationFilter, setWorkstationFilter] = useState<string | "all">("all");
  const [showCapacity, setShowCapacity] = useState(false);
  const [bottomPct, setBottomPct] = useState(DEFAULT_BOTTOM_PCT);
  const [showComparePlan, setShowComparePlan] = useState(false);
  const [timelineWidthPx, setTimelineWidthPx] = useState(1100);
  const trackRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineInnerRef = useRef<HTMLDivElement>(null);
  const [flowPaths, setFlowPaths] = useState<string[]>([]);
  const [layoutEpoch, bumpLayout] = useState(0);

  const onShiftBlocks = data.onShiftBlocks ?? [];
  const orderTableRows = data.orderTableRows ?? [];

  const windowStart = useMemo(() => new Date(data.window.start), [data.window.start]);
  const windowEnd = useMemo(() => new Date(data.window.end), [data.window.end]);
  const canSchedule = data.capabilities.canSchedule;
  const headerTiers = useMemo(
    () => buildGanttHeaderTiers(windowStart, windowEnd, data.window.zoom),
    [windowStart, windowEnd, data.window.zoom]
  );
  const headerHours = useMemo(
    () => filterHeaderHoursBySpacing(headerTiers.hours, windowStart, windowEnd, timelineWidthPx),
    [headerTiers.hours, timelineWidthPx, windowEnd, windowStart]
  );
  const lateSummary = data.lateSummary ?? { lateJobs: 0, lateOrders: 0 };

  useLayoutEffect(() => {
    const node = timelineInnerRef.current;
    if (!node) return;
    const measure = () => setTimelineWidthPx(node.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const wsById = useMemo(() => new Map(data.workstations.map((row) => [row.id, row])), [data.workstations]);

  const searchLower = searchQuery.trim().toLowerCase();
  const barMatchesSearch = useCallback(
    (bar: GanttBar) => {
      if (!searchLower) return true;
      return (
        bar.batchLabel.toLowerCase().includes(searchLower) ||
        bar.orderNumber.toLowerCase().includes(searchLower) ||
        bar.productName.toLowerCase().includes(searchLower)
      );
    },
    [searchLower]
  );

  const [liveNowIso, setLiveNowIso] = useState<string | null>(null);
  useEffect(() => {
    setLiveNowIso(new Date().toISOString());
    const timer = window.setInterval(() => setLiveNowIso(new Date().toISOString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const anchorNow = data.anchorNow ?? data.window.start;
  const nowInstant = liveNowIso ?? anchorNow;

  const nowPct = useMemo(() => {
    const at = new Date(nowInstant).getTime();
    if (at < windowStart.getTime() || at > windowEnd.getTime()) return null;
    return ganttPctForStyle(ganttLeftPctFromTime(new Date(at), windowStart, windowEnd));
  }, [nowInstant, windowEnd, windowStart]);

  const runningLockBand = useMemo(() => {
    if (nowPct == null) return null;
    const freezeEnd = new Date(data.planningPolicy.freezeUntil).getTime();
    const at = new Date(nowInstant).getTime();
    if (freezeEnd <= at) return null;
    const endPct = ganttPctForStyle(ganttLeftPctFromTime(new Date(freezeEnd), windowStart, windowEnd));
    if (endPct <= nowPct) return null;
    return { leftPct: nowPct, widthPct: ganttPctForStyle(endPct - nowPct) };
  }, [data.planningPolicy.freezeUntil, nowInstant, nowPct, windowEnd, windowStart]);

  const barByOperationId = useMemo(() => new Map(data.bars.map((bar) => [bar.operationId, bar])), [data.bars]);

  useLayoutEffect(() => {
    const flowOrderId = selectedOrderId;
    if (!flowOrderId || !scrollRef.current || !timelineInnerRef.current) {
      setFlowPaths([]);
      return;
    }
    const inner = timelineInnerRef.current;
    const innerRect = inner.getBoundingClientRect();
    const paths: string[] = [];
    for (const edge of data.flowEdges.filter((row) => row.orderId === flowOrderId)) {
      const fromBar = barByOperationId.get(edge.fromOperationId);
      const toBar = barByOperationId.get(edge.toOperationId);
      if (!fromBar || !toBar) continue;
      const fromTrack = trackRefs.current.get(fromBar.workstationId);
      const toTrack = trackRefs.current.get(toBar.workstationId);
      if (!fromTrack || !toTrack) continue;
      const fromLayout = ganttBarLayout(fromBar.start, fromBar.end, windowStart, windowEnd);
      const toLayout = ganttBarLayout(toBar.start, toBar.end, windowStart, windowEnd);
      if (!fromLayout || !toLayout) continue;
      const fromRect = fromTrack.getBoundingClientRect();
      const toRect = toTrack.getBoundingClientRect();
      const x1 = fromRect.left - innerRect.left + ((fromLayout.leftPct + fromLayout.widthPct) / 100) * fromRect.width;
      const x2 = toRect.left - innerRect.left + (toLayout.leftPct / 100) * toRect.width;
      const y1 = fromRect.top - innerRect.top + ROW_HEIGHT / 2;
      const y2 = toRect.top - innerRect.top + ROW_HEIGHT / 2;
      const elbow = Math.min(56, Math.abs(x2 - x1) / 3 + 16);
      paths.push(`M ${x1} ${y1} C ${x1 + elbow} ${y1}, ${x2 - elbow} ${y2}, ${x2} ${y2}`);
    }
    setFlowPaths(paths);
  }, [barByOperationId, data.flowEdges, selectedOrderId, windowEnd, windowStart, collapsedGroups, data.bars, layoutEpoch]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onScroll = () => bumpLayout((value) => value + 1);
    node.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => bumpLayout((value) => value + 1));
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [collapsedGroups, data.groups]);

  const barsByWs = useMemo(() => {
    const map = new Map<string, GanttBar[]>();
    for (const bar of data.bars) {
      const list = map.get(bar.workstationId) ?? [];
      list.push(bar);
      map.set(bar.workstationId, list);
    }
    return map;
  }, [data.bars]);

  const onShiftByWs = useMemo(() => {
    const map = new Map<string, typeof onShiftBlocks>();
    for (const block of onShiftBlocks) {
      const list = map.get(block.workstationId) ?? [];
      list.push(block);
      map.set(block.workstationId, list);
    }
    return map;
  }, [onShiftBlocks]);

  const maintenanceByWs = useMemo(() => {
    const map = new Map<string, typeof data.maintenanceBlocks>();
    for (const block of data.maintenanceBlocks) {
      const list = map.get(block.workstationId) ?? [];
      list.push(block);
      map.set(block.workstationId, list);
    }
    return map;
  }, [data.maintenanceBlocks]);

  const visibleGroups = useMemo(() => {
    if (workstationFilter === "all") return data.groups;
    return data.groups
      .map((group) => ({
        ...group,
        workstationIds: group.workstationIds.filter((id) => id === workstationFilter),
      }))
      .filter((group) => group.workstationIds.length > 0);
  }, [data.groups, workstationFilter]);

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
      if (row?.dataset.ganttWorkstationId) workstationId = row.dataset.ganttWorkstationId;

      setDrag(null);
      setDragOffsetPct(0);

      if (!drag.bar.qualifiedWorkstationIds.includes(workstationId)) {
        setMessage("Target line is not qualified for this step.");
        return;
      }
      if (drag.bar.isLocked) {
        setMessage("Order is locked.");
        return;
      }

      startTransition(async () => {
        setMessage(null);
        const response = await fetch("/api/schedule-plans/propose-move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operationId: drag.bar.operationId,
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
        setMessage("Move proposed — ghost outline shows the current plan.");
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
    if (!canSchedule || bar.isLocked || bar.status === "IN_PROGRESS" || bar.status === "COMPLETED" || pending) return;
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

  const runContextAction = useCallback(
    (action: string, bar: GanttBar) => {
      setContextMenu(null);
      startTransition(async () => {
        if (action === "FAST_TRACK") {
          const response = await fetch("/api/schedule-plans/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "FAST_TRACK", orderId: bar.orderId }),
          });
          if (!response.ok) setMessage("Fast track failed.");
          else router.refresh();
        }
        if (action === "LOCK") {
          const response = await fetch(`/api/production-orders/${bar.orderId}/planner-meta`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isLocked: !bar.isLocked }),
          });
          if (!response.ok) setMessage("Lock update failed.");
          else router.refresh();
        }
        if (action === "PRIORITY") {
          const response = await fetch(`/api/production-orders/${bar.orderId}/planner-meta`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ priority: "CRITICAL" }),
          });
          if (!response.ok) setMessage("Priority update failed.");
          else {
            setMessage(`${bar.orderNumber} set to CRITICAL priority.`);
            router.refresh();
          }
        }
        if (action === "SPLIT") {
          setMessage("Split across a workstation group — coming in job rules (Phase 13).");
        }
        if (action === "NOTE") {
          setMessage(`Planner note stub for ${bar.orderNumber} — attach on shop floor.`);
        }
      });
    },
    [router]
  );

  const scrollToOperation = (operationId: string) => {
    const bar = barByOperationId.get(operationId);
    if (!bar) return;
    const track = trackRefs.current.get(bar.workstationId);
    track?.scrollIntoView({ block: "center", behavior: "smooth" });
    bumpLayout((v) => v + 1);
  };

  const planAction = (fn: () => Promise<void>) => {
    startTransition(async () => {
      setMessage(null);
      await fn();
    });
  };

  const scheduleUnscheduled = () => {
    planAction(async () => {
      const response = await fetch("/api/schedule-plans/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UNSCHEDULED_ONLY" }),
      });
      if (!response.ok) setMessage("Schedule unscheduled failed.");
      else router.refresh();
    });
  };

  const exportPng = () => {
    setMessage("PNG export: use your browser screenshot for now (camera wiring next).");
  };

  const beginResizeBottom = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startPct = bottomPct;
    const onMove = (moveEvent: PointerEvent) => {
      const parent = scrollRef.current?.parentElement;
      if (!parent) return;
      const delta = moveEvent.clientY - startY;
      const next = startPct - (delta / parent.clientHeight) * 100;
      setBottomPct(Math.min(55, Math.max(15, next)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const renderBar = (bar: GanttBar, wsId: string, trackWidth: number) => {
    const ws = wsById.get(wsId);
    const segments = bar.workSegments?.length ? bar.workSegments : [{ start: bar.start, end: bar.end }];
    const isDragging = drag?.bar.id === bar.id;
    const selected = selectedOrderId === bar.orderId;
    const dimmed = searchLower.length > 0 && !barMatchesSearch(bar);
    const fillClass = selected ? ganttBarSelectedClass : ganttBarFillClass[bar.tone as GanttBarTone];
    const coLayout =
      bar.changeoverMinutes > 0
        ? ganttBarLayout(
            new Date(new Date(bar.start).getTime() - bar.changeoverMinutes * 60_000).toISOString(),
            bar.start,
            windowStart,
            windowEnd
          )
        : null;

    let widestPx = 0;
    let labelSegmentIndex = 0;
    segments.forEach((seg, index) => {
      const layout = ganttBarLayout(seg.start, seg.end, windowStart, windowEnd);
      if (!layout) return;
      const px = (layout.widthPct / 100) * trackWidth;
      if (px > widestPx) {
        widestPx = px;
        labelSegmentIndex = index;
      }
    });

    return (
      <div key={bar.id} className="contents">
        {showComparePlan && bar.ghost && bar.ghost.workstationId === wsId
          ? bar.ghost.workSegments.map((seg, index) => {
              const layout = ganttBarLayout(seg.start, seg.end, windowStart, windowEnd);
              if (!layout) return null;
              return (
                <div
                  key={`ghost-${index}`}
                  className="absolute z-[5] rounded-[3px] bg-[#d1d5db]"
                  style={{
                    top: BAR_TOP,
                    height: BAR_HEIGHT,
                    left: `${layout.leftPct}%`,
                    width: `${Math.max(layout.widthPct, 0.35)}%`,
                  }}
                  aria-hidden
                />
              );
            })
          : null}
        {coLayout ? (
          <div
            className={cn("absolute z-[6] max-w-[12px] rounded-[3px] opacity-95", ganttBarFillClass.changeover)}
            style={{
              top: BAR_TOP,
              height: BAR_HEIGHT,
              left: `${coLayout.leftPct}%`,
              width: `${Math.max(coLayout.widthPct, 0.25)}%`,
            }}
            title="Changeover / cleaning"
            aria-hidden
          />
        ) : null}
        {segments.map((seg, index) => {
          const layout = ganttBarLayout(seg.start, seg.end, windowStart, windowEnd);
          if (!layout) return null;
          let left = layout.leftPct;
          if (isDragging && index === 0) left += dragOffsetPct;
          const widthPx = (layout.widthPct / 100) * trackWidth;
          const widthPct = widthPx < MIN_BAR_PX ? (MIN_BAR_PX / trackWidth) * 100 : layout.widthPct;
          const showLabel = index === labelSegmentIndex && widthPx >= MIN_LABEL_PX;
          return (
            <div
              key={`${bar.id}-${index}`}
              role="button"
              tabIndex={0}
              data-gantt-bar-id={bar.id}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedOrderId(bar.orderId);
              }}
              onPointerDown={(event) => beginDrag(bar, wsId, event)}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ bar, x: event.clientX, y: event.clientY });
              }}
              title={formatTooltip(bar, ws?.code ?? wsId)}
              className={cn(
                "absolute z-10 overflow-visible rounded-[3px] px-1 text-xs leading-[26px] text-white shadow-sm",
                fillClass,
                canSchedule && !bar.isLocked ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-default",
                isDragging && index === 0 && "ring-2 ring-amber-400",
                dimmed && "opacity-35"
              )}
              style={{
                top: BAR_TOP,
                height: BAR_HEIGHT,
                left: `${left}%`,
                width: `${widthPct}%`,
                minWidth: MIN_BAR_PX,
              }}
            >
              {showLabel ? <span className="block truncate">{bar.label}</span> : null}
              {showLabel && barHasWarning(bar) ? (
                <span
                  className="absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-[var(--planner-late-red)] text-[9px] font-bold leading-none text-white"
                  aria-hidden
                >
                  !
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background" onClick={() => setContextMenu(null)}>
      <GanttPlannerToolbar
        windowStartIso={data.window.start}
        zoom={data.window.zoom}
        workstations={data.workstations}
        workstationFilter={workstationFilter}
        onWorkstationFilterChange={setWorkstationFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onOpenRules={() => setRulesOpen(true)}
        onExportPng={exportPng}
        plantNowLabel={formatGanttNowLabel(nowInstant)}
      />

      <PlannerGlobalRulesDrawer
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        initialPolicy={data.planningPolicy}
        canEdit={canGlobalRules}
        onSaved={() => router.refresh()}
      />

      {message ? (
        <p className="border-b border-border px-3 py-1 text-xs text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="min-h-0 min-w-0 overflow-auto border-b border-border"
          style={{ flex: `1 1 ${100 - bottomPct}%` }}
        >
          <div ref={timelineInnerRef} className="relative min-w-[1100px] bg-[var(--planner-canvas,var(--background))]">
            {selectedOrderId && flowPaths.length > 0 ? (
              <svg className="pointer-events-none absolute inset-0 z-[15] h-full w-full overflow-visible" aria-hidden>
                <defs>
                  <marker id={flowMarkerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="var(--planner-flow-red)" />
                  </marker>
                </defs>
                {flowPaths.map((path, index) => (
                  <path
                    key={index}
                    d={path}
                    fill="none"
                    stroke="var(--planner-flow-red)"
                    strokeWidth={1.75}
                    markerEnd={`url(#${flowMarkerId})`}
                  />
                ))}
              </svg>
            ) : null}

            <div
              className="sticky top-0 z-40 grid border-b border-border bg-background"
              style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}
            >
              <div className="border-r border-border bg-muted/30" aria-hidden />
              <div className="relative">
                <div className="relative flex h-5 border-b border-border/60">
                  {headerTiers.days.map((day) => {
                    const left = ganttLeftPctFromTime(new Date(day.start), windowStart, windowEnd);
                    const right = ganttLeftPctFromTime(new Date(day.end), windowStart, windowEnd);
                    const width = ganttPctForStyle(right - left);
                    return (
                      <div
                        key={day.start}
                        className="absolute inset-y-0 border-r border-[var(--planner-grid-line)] px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        {day.label}
                      </div>
                    );
                  })}
                  {nowPct != null ? (
                    <div className="pointer-events-none absolute top-0 z-20 -translate-x-1/2" style={{ left: `${nowPct}%` }}>
                      <div className="size-0 border-x-[5px] border-b-[6px] border-x-transparent border-b-[var(--planner-late-red)]" />
                    </div>
                  ) : null}
                </div>
                <div className="relative h-5">
                  {headerHours.map((hour) => {
                    const pct = ganttLeftPctFromTime(new Date(hour.at), windowStart, windowEnd);
                    return (
                      <div
                        key={hour.at}
                        className="absolute top-0 h-full -translate-x-1/2 border-l border-[var(--planner-grid-line)] pl-1 text-[10px] tabular-nums text-muted-foreground"
                        style={{ left: `${pct}%` }}
                      >
                        {hour.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {visibleGroups.map((group) => {
              const collapsed = collapsedGroups.has(group.id);
              return (
                <div key={group.id}>
                  <button
                    type="button"
                    className="sticky left-0 z-30 flex w-full items-center gap-1.5 border-b border-border bg-muted/50 px-2 text-left text-[11px] font-medium text-muted-foreground"
                    style={{ height: GROUP_HEIGHT }}
                    onClick={() =>
                      setCollapsedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.id)) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      })
                    }
                  >
                    {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                    {group.name}
                  </button>
                  {!collapsed
                    ? group.workstationIds.map((wsId) => {
                        const ws = wsById.get(wsId);
                        if (!ws) return null;
                        const rowBars = barsByWs.get(wsId) ?? [];
                        const maint = maintenanceByWs.get(wsId) ?? [];
                        const rowHeight = showCapacity && !ws.elapsedOnly ? ROW_HEIGHT + 10 : ROW_HEIGHT;
                        return (
                          <div
                            key={wsId}
                            className="mb-1 grid bg-background"
                            style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}
                          >
                            <div
                              className="flex items-center border-r border-border/70 px-2 text-xs font-medium"
                              style={{ height: rowHeight }}
                              title={`${ws.code} · ${ws.utilization ?? 0}% load · ${ws.scheduledHours}h / ${ws.availableHours}h`}
                            >
                              <span className="truncate">{ws.name}</span>
                            </div>
                            <div className="flex flex-col">
                              <div
                                ref={(node) => {
                                  if (node) trackRefs.current.set(wsId, node);
                                }}
                                data-gantt-workstation-id={wsId}
                                className="relative bg-background"
                                style={{ height: ROW_HEIGHT }}
                                onClick={() => setSelectedOrderId(null)}
                              >
                                {(onShiftByWs.get(wsId) ?? []).map((block) => {
                                  const layout = ganttBarLayout(block.start, block.end, windowStart, windowEnd);
                                  if (!layout) return null;
                                  return (
                                    <div
                                      key={block.id}
                                      className="pointer-events-none absolute top-0 z-[1] h-full bg-[var(--planner-shift-green)]"
                                      style={{ left: `${layout.leftPct}%`, width: `${Math.max(layout.widthPct, 0.2)}%` }}
                                      aria-hidden
                                    />
                                  );
                                })}
                                {headerHours.map((hour) => {
                                  const pct = ganttLeftPctFromTime(new Date(hour.at), windowStart, windowEnd);
                                  return (
                                    <div
                                      key={`${wsId}-${hour.at}`}
                                      className="pointer-events-none absolute top-0 z-[0] h-full w-px bg-[var(--planner-grid-line)]"
                                      style={{ left: `${pct}%` }}
                                      aria-hidden
                                    />
                                  );
                                })}
                                {runningLockBand ? (
                                  <div
                                    className="pointer-events-none absolute top-0 z-[2] h-full opacity-40"
                                    style={{
                                      left: `${runningLockBand.leftPct}%`,
                                      width: `${runningLockBand.widthPct}%`,
                                      background:
                                        "repeating-linear-gradient(135deg, transparent, transparent 4px, rgb(245 158 11 / 0.35) 4px, rgb(245 158 11 / 0.35) 8px)",
                                    }}
                                    title="Running time lock"
                                    aria-hidden
                                  />
                                ) : null}
                                {nowPct != null ? (
                                  <div
                                    className="pointer-events-none absolute top-0 z-30 h-full w-px -translate-x-1/2 bg-[var(--planner-late-red)]"
                                    style={{ left: `${nowPct}%` }}
                                    title={`Now · ${formatGanttNowLabel(nowInstant)}`}
                                    aria-hidden
                                  />
                                ) : null}
                                {maint.map((block) => {
                                  const layout = ganttBarLayout(block.start, block.end, windowStart, windowEnd);
                                  if (!layout) return null;
                                  return (
                                    <div
                                      key={block.id}
                                      className={cn(
                                        "absolute z-[4] rounded-[3px]",
                                        ganttBarFillClass.maintenance
                                      )}
                                      style={{
                                        top: BAR_TOP,
                                        height: BAR_HEIGHT,
                                        left: `${layout.leftPct}%`,
                                        width: `${Math.max(layout.widthPct, 1)}%`,
                                      }}
                                      title={block.reason}
                                    />
                                  );
                                })}
                                {(() => {
                                  const track = trackRefs.current.get(wsId);
                                  const trackWidth = track?.getBoundingClientRect().width ?? 800;
                                  return rowBars.map((bar) => renderBar(bar, wsId, trackWidth));
                                })()}
                              </div>
                              {showCapacity && !ws.elapsedOnly ? (
                                <div className="relative h-2.5 border-t border-border/40 bg-muted/10">
                                  <div
                                    className={cn(
                                      "absolute inset-y-0 left-0",
                                      ws.capacityState === "DANGER"
                                        ? "bg-red-600/80"
                                        : ws.capacityState === "WARNING"
                                          ? "bg-amber-600/80"
                                          : "bg-emerald-600/70"
                                    )}
                                    style={{ width: `${Math.min(100, ws.utilization ?? 0)}%` }}
                                    title={`${ws.utilization ?? 0}% capacity`}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    : null}
                </div>
              );
            })}
          </div>
        </div>

        <div
          role="separator"
          aria-orientation="horizontal"
          className="h-1 shrink-0 cursor-row-resize bg-border/80 hover:bg-primary/30"
          onPointerDown={beginResizeBottom}
        />

        <div style={{ flex: `0 0 ${bottomPct}%` }} className="min-h-0">
          <GanttOrderBottomPanel
            rows={orderTableRows}
            selectedOrderId={selectedOrderId}
            showCapacity={showCapacity}
            onToggleCapacity={() => setShowCapacity((value) => !value)}
            onSelectOrder={(orderId, operationId) => {
              setSelectedOrderId(orderId);
              scrollToOperation(operationId);
            }}
            canSchedule={canSchedule}
            onScheduleUnscheduled={scheduleUnscheduled}
            pending={pending}
            lateJobCount={lateSummary.lateJobs}
          />
        </div>

        <GanttReschedulePill
          proposal={data.proposal}
          diffSummary={data.diffSummary}
          canSchedule={canSchedule}
          scheduleStatusLine={data.scheduleStatusLine}
          lateSummary={lateSummary}
          showComparePlan={showComparePlan}
          onShowComparePlanChange={setShowComparePlan}
          onMessage={setMessage}
        />
      </div>

      {contextMenu ? (
        <div
          className="fixed z-50 min-w-[10rem] rounded-md border border-border bg-popover p-1 text-sm shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          {[
            ["LOCK", contextMenu.bar.isLocked ? "Unlock order" : "Lock order"],
            ["PRIORITY", "Set priority (Critical)"],
            ["FAST_TRACK", "Fast track"],
            ["SPLIT", "Split job"],
            ["NOTE", "Add planner note"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
              onClick={() => runContextAction(id, contextMenu.bar)}
            >
              {label}
            </button>
          ))}
          <Link href="/operations?view=orders" className="block rounded px-2 py-1.5 hover:bg-muted">
            Open order task list
          </Link>
        </div>
      ) : null}
    </div>
  );
}
