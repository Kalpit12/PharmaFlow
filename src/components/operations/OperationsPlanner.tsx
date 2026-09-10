"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Lock } from "lucide-react";

import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import type { OperationsView } from "@/lib/server/operations";
import type { MaterialReadinessState } from "@/lib/operations/planning";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/types/status";

type Order = OperationsView["orders"][number];
type Workstation = OperationsView["workstations"][number];
type AttentionItem = OperationsView["conflicts"][number];
type PlanningAttention = OperationsView["planningAttention"][number];
type FocusFilter = "all" | "risk" | "critical" | "unscheduled" | "locked" | "material" | "conflict";
type PlannerView = "schedule" | "capacity" | "attention";
type ZoomId = "6h" | "12h" | "1d" | "1w" | "2w" | "4w";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const SHIFT_HOUR = 8;
const SHIFT_HOURS = 8;

const FOCUS_OPTIONS: Array<{ id: FocusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "risk", label: "At risk" },
  { id: "critical", label: "Critical" },
  { id: "unscheduled", label: "Unscheduled" },
  { id: "material", label: "Material risk" },
  { id: "conflict", label: "Conflicts" },
  { id: "locked", label: "Locked" },
];

const ZOOM_OPTIONS: Array<{ id: ZoomId; label: string; weeks?: 1 | 2 | 4 }> = [
  { id: "6h", label: "6h" },
  { id: "12h", label: "12h" },
  { id: "1d", label: "1D" },
  { id: "1w", label: "1W", weeks: 1 },
  { id: "2w", label: "2W", weeks: 2 },
  { id: "4w", label: "4W", weeks: 4 },
];

function isoDay(value: string): string {
  return value.slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date.toISOString());
}

function startOfUtcDayMs(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function shiftStartMs(ms: number): number {
  return startOfUtcDayMs(ms) + SHIFT_HOUR * HOUR_MS;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function utcParts(iso: string): { weekday: string; day: number; month: string } {
  const date = iso.includes("T") ? new Date(iso) : new Date(`${iso}T00:00:00.000Z`);
  return {
    weekday: WEEKDAY_SHORT[date.getUTCDay()],
    day: date.getUTCDate(),
    month: MONTH_SHORT[date.getUTCMonth()],
  };
}

function dayLabel(iso: string): string {
  const { weekday, day, month } = utcParts(iso);
  return `${weekday} ${day} ${month}`;
}

function monthDay(iso: string): string {
  const { day, month } = utcParts(iso);
  return `${day} ${month}`;
}

function clockLabel(iso: string): string {
  const date = new Date(iso);
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function hourLabel(ms: number): string {
  return clockLabel(new Date(ms).toISOString());
}

function shortDay(iso: string): string {
  return dayLabel(isoDay(iso));
}

function quantityLabel(value: number): string {
  return `${value.toLocaleString("en-GB")} units`;
}

function compactQty(value: number): string {
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return String(value);
}

function statusLabel(status: Order["displayStatus"]): string {
  if (status === "AT_RISK") return "At risk";
  if (status === "UNSCHEDULED") return "Unscheduled";
  return "On schedule";
}

function statusTone(status: Order["displayStatus"]): StatusTone {
  if (status === "AT_RISK") return "danger";
  if (status === "UNSCHEDULED") return "neutral";
  return "intel";
}

function matchesFocus(order: Order, focus: FocusFilter): boolean {
  if (focus === "all") return true;
  if (focus === "risk") return order.displayStatus === "AT_RISK";
  if (focus === "critical") return order.priority === "CRITICAL";
  if (focus === "unscheduled") return order.displayStatus === "UNSCHEDULED";
  if (focus === "material") return order.materialReadiness === "SHORTAGE" || order.materialReadiness === "AT_RISK";
  if (focus === "conflict") return order.conflictCount > 0;
  return order.isLocked;
}

function readinessLabel(state: MaterialReadinessState): string {
  if (state === "SHORTAGE") return "Shortage";
  if (state === "AT_RISK") return "At risk";
  if (state === "READY") return "Ready";
  return "Needs review";
}

function readinessTone(state: MaterialReadinessState): StatusTone {
  if (state === "SHORTAGE") return "danger";
  if (state === "AT_RISK") return "warning";
  if (state === "READY") return "intel";
  return "neutral";
}

function severityTone(severity: AttentionItem["severity"]): StatusTone {
  if (severity === "CRITICAL") return "danger";
  if (severity === "WARNING") return "warning";
  return "neutral";
}

function productionStatusLabel(status: Order["status"]): string {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function productionStatusTone(status: Order["status"]): StatusTone {
  if (status === "IN_PROGRESS") return "intel";
  if (status === "AT_RISK") return "danger";
  if (status === "COMPLETED") return "neutral";
  if (status === "SCHEDULED") return "info";
  return "neutral";
}

function matchesQuery(order: Order, query: string): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return order.productName.toLowerCase().includes(needle) || order.orderNumber.toLowerCase().includes(needle);
}

function attentionKind(item: AttentionItem): { label: string; tone: StatusTone; view: PlannerView } {
  if (item.kind === "delivery-risk") return { label: "Delivery risk", tone: "danger", view: "schedule" };
  if (item.kind === "over-capacity") return { label: "Capacity", tone: "danger", view: "capacity" };
  if (item.kind === "unscheduled") return { label: "Unscheduled", tone: "neutral", view: "schedule" };
  if (item.kind === "overlap") return { label: "Overlap", tone: "warning", view: "schedule" };
  if (item.kind === "missing-info" || item.kind === "invalid-duration") return { label: "Needs review", tone: "warning", view: "attention" };
  if (item.kind === "inactive-workstation") return { label: "Workstation", tone: "danger", view: "attention" };
  return { label: "Planning", tone: severityTone(item.severity), view: "schedule" };
}

function attentionAction(item: AttentionItem): string {
  if (item.kind === "over-capacity") return "View capacity";
  if (item.kind === "unscheduled") return "Review unscheduled";
  if (item.kind === "missing-info") return "Review planning";
  return "Review schedule";
}

function capacityBarClass(state: Workstation["capacityState"]): string {
  if (state === "DANGER") return "bg-danger";
  if (state === "WARNING") return "bg-warning";
  return "bg-primary";
}

function zoomFromWeeks(weeks: 1 | 2 | 4): ZoomId {
  if (weeks === 4) return "4w";
  if (weeks === 2) return "2w";
  return "1w";
}

function isClockZoom(zoom: ZoomId): boolean {
  return zoom === "6h" || zoom === "12h";
}

function clockSpan(zoom: ZoomId): number {
  if (zoom === "6h") return 6 * HOUR_MS;
  if (zoom === "12h") return 12 * HOUR_MS;
  return DAY_MS;
}

function workingOffset(ms: number, viewStart: number): number {
  const startDay = startOfUtcDayMs(viewStart);
  const tDay = startOfUtcDayMs(Math.max(ms, viewStart));
  const days = Math.max(0, Math.round((tDay - startDay) / DAY_MS));
  const within = Math.min(SHIFT_HOURS * HOUR_MS, Math.max(0, Math.max(ms, viewStart) - shiftStartMs(Math.max(ms, viewStart))));
  const viewWithin = Math.min(SHIFT_HOURS * HOUR_MS, Math.max(0, viewStart - shiftStartMs(viewStart)));
  return days * SHIFT_HOURS * HOUR_MS + within - viewWithin;
}

function lineStats(ws: Workstation, orders: Order[], conflicts: AttentionItem[]) {
  const lineOrders = orders.filter((order) => order.workstationId === ws.id);
  const scheduled = lineOrders.filter((order) => order.plannedStart && order.plannedEnd);
  const atRisk = scheduled.filter((order) => order.displayStatus === "AT_RISK").length;
  const conflictCount = conflicts.filter(
    (item) =>
      item.productName === ws.name ||
      item.title.toLowerCase().includes(ws.name.toLowerCase()) ||
      scheduled.some((order) => order.orderNumber === item.orderNumber)
  ).length;
  return { scheduled: scheduled.length, atRisk, conflictCount };
}

function delayDays(order: Order): number | null {
  if (!order.plannedEnd) return null;
  const delay = new Date(order.plannedEnd).getTime() - new Date(order.dueDate).getTime();
  if (delay <= 0) return 0;
  return Math.ceil(delay / DAY_MS);
}

function useClientNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);
  return now;
}

export function OperationsPlanner({ data }: { data: OperationsView }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const now = useClientNow();
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [workstationId, setWorkstationId] = useState("all");
  const initialView = searchParams.get("view");
  const [view, setView] = useState<PlannerView>(
    initialView === "capacity" || initialView === "attention" ? initialView : "schedule"
  );
  const [focus, setFocus] = useState<FocusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomId>(zoomFromWeeks(data.window.weeks));
  const [viewStartMs, setViewStartMs] = useState(() => new Date(data.window.start).getTime());

  const start = isoDay(data.window.start);
  const weeks = data.window.weeks;
  const dataStart = new Date(data.window.start).getTime();
  const dataEnd = new Date(data.window.end).getTime();

  useEffect(() => {
    setZoom(zoomFromWeeks(data.window.weeks));
    setViewStartMs(new Date(data.window.start).getTime());
  }, [data.window.start, data.window.weeks]);

  const href = (next: { start?: string; weeks?: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("start", next.start ?? start);
    params.set("weeks", String(next.weeks ?? weeks));
    return `${pathname}?${params.toString()}`;
  };

  const lastDay = addDays(isoDay(data.window.end), -1);
  const clock = isClockZoom(zoom);
  const viewEndMs = clock ? viewStartMs + clockSpan(zoom) : zoom === "1d" ? startOfUtcDayMs(viewStartMs) + DAY_MS : dataEnd;
  const visibleStart = clock || zoom === "1d" ? viewStartMs : dataStart;
  const visibleEnd = clock || zoom === "1d" ? viewEndMs : dataEnd;

  const days = useMemo(() => {
    const list: string[] = [];
    const begin = startOfUtcDayMs(visibleStart);
    for (let t = begin; t < visibleEnd; t += DAY_MS) {
      list.push(isoDay(new Date(t).toISOString()));
    }
    return list;
  }, [visibleEnd, visibleStart]);

  const hourMarks = useMemo(() => {
    if (!clock) return [];
    const step = zoom === "6h" ? HOUR_MS : 2 * HOUR_MS;
    const marks: number[] = [];
    const first = Math.ceil(visibleStart / HOUR_MS) * HOUR_MS;
    for (let t = first; t < visibleEnd; t += step) marks.push(t);
    if (marks[0] !== visibleStart) marks.unshift(visibleStart);
    return marks;
  }, [clock, visibleEnd, visibleStart, zoom]);

  const totalWorking = Math.max(1, days.length * SHIFT_HOURS * HOUR_MS);
  const clockRange = Math.max(1, visibleEnd - visibleStart);

  const position = (iso: string) => {
    const ms = new Date(iso).getTime();
    if (clock) return ((ms - visibleStart) / clockRange) * 100;
    return (workingOffset(ms, visibleStart) / totalWorking) * 100;
  };

  const nowVisible = now !== null && now >= visibleStart && now < visibleEnd;
  const nowLeft =
    now === null
      ? 0
      : Number(((clock ? ((now - visibleStart) / clockRange) * 100 : (workingOffset(now, visibleStart) / totalWorking) * 100)).toFixed(4));

  const rows = data.workstations.filter((row) => workstationId === "all" || row.id === workstationId);
  const selected = data.orders.find((order) => order.id === selectedId) ?? null;
  const metricStrip = data.kpis.filter((kpi) =>
    ["scheduled", "at-risk", "utilization", "material-shortage", "over-capacity", "planned-qty"].includes(kpi.id)
  );
  const detailedBars = zoom === "6h" || zoom === "12h" || zoom === "1d";

  const refreshPlanner = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const runPlannerAction = async (url: string, init: RequestInit) => {
    setActionError(null);
    const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setActionError(payload.message ?? "Unable to update production plan.");
      return false;
    }
    refreshPlanner();
    return true;
  };

  const visible = (order: Order) => matchesFocus(order, focus) && matchesQuery(order, query);
  const unscheduledVisible = data.orders.filter(
    (order) => order.displayStatus === "UNSCHEDULED" && visible(order) && (workstationId === "all" || order.workstationId === workstationId)
  );
  const mobileOrders = data.orders.filter(
    (order) =>
      order.plannedStart &&
      order.plannedEnd &&
      visible(order) &&
      (workstationId === "all" || order.workstationId === workstationId)
  );

  const openOrder = (id: string) => setSelectedId(id);
  const handlePlanningAttention = (item: PlanningAttention) => {
    setView(item.view);
    if (item.focus) setFocus(item.focus);
    if (item.href.startsWith("/operations")) return;
    router.push(item.href);
  };

  const handleAttention = (item: AttentionItem) => {
    const kind = attentionKind(item);
    setView(kind.view);
    if (item.kind === "unscheduled") setFocus("unscheduled");
    if (item.kind === "overlap" || item.kind === "missing-info") setFocus("conflict");
    const match = data.orders.find((order) => order.orderNumber === item.orderNumber);
    if (match) setSelectedId(match.id);
  };

  const setClientZoom = (next: ZoomId) => {
    setZoom(next);
    if (next === "6h" || next === "12h") {
      setViewStartMs(shiftStartMs(dataStart));
      return;
    }
    if (next === "1d") {
      setViewStartMs(startOfUtcDayMs(dataStart));
      return;
    }
    setViewStartMs(dataStart);
  };

  const panClient = (direction: -1 | 1) => {
    const step = zoom === "1d" ? DAY_MS : clockSpan(zoom);
    const span = zoom === "1d" ? DAY_MS : clockSpan(zoom);
    setViewStartMs((current) => {
      const next = current + direction * step;
      const maxStart = Math.max(dataStart, dataEnd - span);
      return Math.min(maxStart, Math.max(dataStart, next));
    });
  };

  const periodLabel = clock
    ? `${clockLabel(new Date(visibleStart).toISOString())} – ${clockLabel(new Date(visibleEnd).toISOString())} · ${monthDay(isoDay(new Date(visibleStart).toISOString()))}`
    : zoom === "1d"
      ? dayLabel(isoDay(new Date(visibleStart).toISOString()))
      : `${dayLabel(start)} – ${dayLabel(lastDay)}`;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section
        aria-label="Planning metrics"
        className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm"
      >
        {metricStrip.map((kpi) => (
          <InlineStat
            key={kpi.id}
            value={kpi.value}
            label={kpi.label}
            warning={kpi.id === "at-risk" || kpi.id === "material-shortage" || kpi.id === "over-capacity"}
            danger={kpi.id === "over-capacity" && kpi.value !== "0"}
          />
        ))}
      </section>

      {data.planningAttention.length > 0 ? (
        <PlanningAttentionStrip items={data.planningAttention} onAction={handlePlanningAttention} />
      ) : null}

      <div className="flex min-w-0 flex-col gap-2.5 border-b border-border pb-3">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={view} onValueChange={(value) => setView(value as PlannerView)} className="min-w-0 gap-0">
            <TabsList className="h-11 w-full max-w-md sm:h-8">
              <TabsTrigger value="schedule" className="min-h-11 sm:min-h-7">
                Schedule
              </TabsTrigger>
              <TabsTrigger value="capacity" className="min-h-11 sm:min-h-7">
                Capacity
              </TabsTrigger>
              <TabsTrigger value="attention" className="min-h-11 sm:min-h-7">
                Attention
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {clock || zoom === "1d" ? (
              <Button type="button" size="icon-sm" variant="outline" className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7" onClick={() => panClient(-1)} aria-label="Previous period">
                <ChevronLeft />
              </Button>
            ) : (
              <Button asChild size="icon-sm" variant="outline" className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7">
                <Link href={href({ start: addDays(start, -weeks * 7) })} aria-label="Previous period">
                  <ChevronLeft />
                </Link>
              </Button>
            )}
            <p className="min-w-0 flex-1 px-1 text-sm font-medium tabular-nums sm:flex-none">{periodLabel}</p>
            {clock || zoom === "1d" ? (
              <Button type="button" size="icon-sm" variant="outline" className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7" onClick={() => panClient(1)} aria-label="Next period">
                <ChevronRight />
              </Button>
            ) : (
              <Button asChild size="icon-sm" variant="outline" className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7">
                <Link href={href({ start: addDays(start, weeks * 7) })} aria-label="Next period">
                  <ChevronRight />
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
              <Link href={href({ start: isoDay(new Date().toISOString()) })}>Today</Link>
            </Button>
            <div className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto pb-0.5">
            {ZOOM_OPTIONS.map((option) =>
              option.weeks && weeks !== option.weeks ? (
                <Button key={option.id} asChild size="sm" variant="outline" className="min-h-11 shrink-0 sm:min-h-7">
                  <Link href={href({ weeks: option.weeks })} aria-label={`${option.label} view`}>
                    {option.label}
                  </Link>
                </Button>
              ) : (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={zoom === option.id ? "default" : "outline"}
                  className="min-h-11 shrink-0 sm:min-h-7"
                  onClick={() => setClientZoom(option.id)}
                >
                  {option.label}
                </Button>
              )
            )}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center">
          <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
            <span className="shrink-0 text-muted-foreground">Workstations</span>
            <select
              value={workstationId}
              onChange={(event) => setWorkstationId(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8 md:max-w-56"
            >
              <option value="all">All lines</option>
              {data.workstations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
            <span className="shrink-0 text-muted-foreground">Focus</span>
            <select
              value={focus}
              onChange={(event) => setFocus(event.target.value as FocusFilter)}
              className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8 md:max-w-40"
            >
              {FOCUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Order or product"
            aria-label="Search production orders"
            className="md:max-w-56 [&_input]:h-11 md:[&_input]:h-8"
          />
        </div>
      </div>

      {view === "schedule" ? (
        <div className="flex min-w-0 flex-col gap-3">
          <section
            aria-label="Production schedule"
            className="min-w-0 overflow-hidden gantt-canvas"
          >
            <Gantt
              compact={compact}
              clock={clock}
              days={days}
              hourMarks={hourMarks}
              rows={rows}
              orders={data.orders}
              conflicts={data.conflicts}
              visible={visible}
              selectedId={selectedId}
              detailedBars={detailedBars}
              nowVisible={nowVisible}
              nowLeft={nowLeft}
              position={position}
              onSelect={openOrder}
            />
          </section>
          {unscheduledVisible.length > 0 ? (
            <UnscheduledList
              orders={unscheduledVisible}
              onSelect={openOrder}
              windowStart={data.window.start}
              onAutoSchedule={runPlannerAction}
              busy={pending}
            />
          ) : null}
          <div className="grid min-w-0 gap-3 xl:grid-cols-2">
            <CompactCapacity workstations={data.workstations} orders={data.orders} />
            <AttentionInbox items={data.attention} onAction={handleAttention} compact />
          </div>
          <ul className="space-y-2 md:hidden">
            {mobileOrders.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => openOrder(order.id)}
                  className="flex w-full min-w-0 items-start justify-between gap-3 border border-border bg-surface px-3.5 py-3 text-left transition duration-150 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring min-h-11"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{order.productName}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {order.orderNumber}
                      {order.plannedStart && order.plannedEnd ? ` · ${clockLabel(order.plannedStart)} – ${clockLabel(order.plannedEnd)}` : null}
                      {order.materialReadiness !== "READY" && order.materialReadiness !== "UNKNOWN"
                        ? ` · Material ${readinessLabel(order.materialReadiness).toLowerCase()}`
                        : null}
                      {order.conflictCount > 0 ? ` · ${order.conflictCount} conflict${order.conflictCount === 1 ? "" : "s"}` : null}
                    </span>
                  </span>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge tone={statusTone(order.displayStatus)}>{statusLabel(order.displayStatus)}</StatusBadge>
                    {order.materialReadiness !== "READY" ? (
                      <StatusBadge tone={readinessTone(order.materialReadiness)}>{readinessLabel(order.materialReadiness)}</StatusBadge>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view === "capacity" ? <CapacityView data={data} /> : null}
      {view === "attention" ? <AttentionInbox items={data.conflicts} onAction={handleAttention} /> : null}

      <Sheet open={selectedId !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={cn("overflow-y-auto", compact ? "max-h-[85vh]" : "sm:max-w-md")}
        >
          {selected ? (
            <OrderDetail
              order={selected}
              workstations={data.workstationsActive}
              conflicts={data.conflicts.filter((item) => item.orderNumber === selected.orderNumber)}
              busy={pending}
              error={actionError}
              onResequence={(direction) => runPlannerAction(`/api/production-orders/${selected.id}/resequence`, { method: "POST", body: JSON.stringify({ direction }) })}
              onAutoSchedule={() =>
                runPlannerAction(`/api/production-orders/${selected.id}/auto-schedule`, {
                  method: "POST",
                  body: JSON.stringify({ windowStart: data.window.start }),
                })
              }
              onUpdateWorkstation={(workstationId) =>
                runPlannerAction(`/api/production-orders/${selected.id}/schedule`, {
                  method: "PATCH",
                  body: JSON.stringify({ workstationId }),
                })
              }
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function InlineStat({
  value,
  label,
  warning = false,
  danger = false,
}: {
  value: string;
  label: string;
  warning?: boolean;
  danger?: boolean;
}) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "text-lg font-semibold tabular-nums tracking-tight",
          danger ? "text-danger" : warning ? "text-warning" : null
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </p>
  );
}

function PlanningAttentionStrip({
  items,
  onAction,
}: {
  items: PlanningAttention[];
  onAction: (item: PlanningAttention) => void;
}) {
  return (
    <section aria-label="Planning attention summary" className="work-surface px-3.5 py-3">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onAction(item)}
            className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-border bg-background px-3 text-left text-xs transition hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StatusBadge tone={severityTone(item.severity)}>{item.severity}</StatusBadge>
            <span className="font-medium">{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Gantt({
  compact,
  clock,
  days,
  hourMarks,
  rows,
  orders,
  conflicts,
  visible,
  selectedId,
  detailedBars,
  nowVisible,
  nowLeft,
  position,
  onSelect,
}: {
  compact: boolean;
  clock: boolean;
  days: string[];
  hourMarks: number[];
  rows: Workstation[];
  orders: Order[];
  conflicts: AttentionItem[];
  visible: (order: Order) => boolean;
  selectedId: string | null;
  detailedBars: boolean;
  nowVisible: boolean;
  nowLeft: number;
  position: (iso: string) => number;
  onSelect: (id: string) => void;
}) {
  const labelWidth = compact ? undefined : "15.5rem";
  const dayMin = clock ? 4.5 : detailedBars ? 14 : days.length > 14 ? 5.25 : 11;
  const columns = clock
    ? `${labelWidth ? `${labelWidth} ` : ""}repeat(${Math.max(hourMarks.length, 1)}, minmax(4.5rem, 1fr))`
    : `${labelWidth ? `${labelWidth} ` : ""}repeat(${days.length}, minmax(${dayMin}rem, 1fr))`;
  const rowColumns = labelWidth ? `${labelWidth} 1fr` : "1fr";
  const minWidth = clock
    ? Math.max(640, hourMarks.length * 72)
    : Math.max(720, days.length * dayMin * 16);

  return (
    <div className="max-h-[min(72vh,46rem)] min-h-[min(58vh,34rem)] overflow-auto max-md:min-h-[18rem] max-md:max-h-[22rem]">
      <div style={{ minWidth }}>
        <div
          className="sticky top-0 z-30 grid border-b border-border bg-card text-[11px] text-muted-foreground"
          style={{ gridTemplateColumns: columns }}
        >
          {labelWidth ? (
            <div className="sticky left-0 z-40 border-r border-border bg-card px-3 py-2 font-medium tracking-wide text-foreground uppercase">
              Workstations
            </div>
          ) : null}
          {clock
            ? hourMarks.map((mark) => (
                <div key={mark} className="border-l border-border px-1 py-2 text-center tabular-nums">
                  {hourLabel(mark)}
                </div>
              ))
            : days.map((day) => (
                <div key={day} className="border-l border-border">
                  <p className="border-b border-border/80 px-1 py-1.5 text-center font-medium text-foreground">{days.length > 14 ? monthDay(day) : dayLabel(day)}</p>
                  {days.length <= 14 ? (
                    <div className="grid grid-cols-5 px-0.5 py-1 tabular-nums text-[10px]">
                      {["08", "10", "12", "14", "16"].map((hour) => (
                        <span key={hour} className="text-center">
                          {hour}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
        </div>
        {rows.map((ws, index) => {
          const jobs = orders.filter((order) => order.workstationId === ws.id && order.plannedStart && order.plannedEnd);
          const stats = lineStats(ws, orders, conflicts);
          const stressed = ws.capacityState !== "OK" || stats.atRisk > 0 || stats.conflictCount > 0;
          return (
            <div
              key={ws.id}
              className="grid border-b border-border last:border-b-0"
              style={{ gridTemplateColumns: rowColumns, minHeight: detailedBars ? "4.75rem" : "4.25rem" }}
            >
              {labelWidth ? (
                <WorkstationLabel
                  name={ws.name}
                  utilization={ws.utilization}
                  scheduled={stats.scheduled}
                  atRisk={stats.atRisk}
                  conflictCount={stats.conflictCount}
                  stressed={stressed}
                />
              ) : null}
              <div className="relative min-h-[4.25rem] border-l border-border">
                <div
                  className="pointer-events-none absolute inset-0 grid"
                  style={{ gridTemplateColumns: clock ? `repeat(${Math.max(hourMarks.length, 1)}, minmax(0, 1fr))` : `repeat(${days.length}, minmax(0, 1fr))` }}
                >
                  {(clock ? hourMarks : days).map((item) => (
                    <div key={String(item)} className="relative border-l border-border/70">
                      {!clock && days.length <= 14
                        ? ["20%", "40%", "60%", "80%"].map((left) => (
                            <span key={left} className="absolute inset-y-0 w-px bg-border/40" style={{ left }} />
                          ))
                        : null}
                    </div>
                  ))}
                </div>
                {nowVisible ? (
                  <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-foreground/55" style={{ left: `${nowLeft}%` }}>
                    {index === 0 ? (
                      <span className="absolute top-1 left-1/2 -translate-x-1/2 rounded-sm bg-foreground px-1 py-px text-[9px] font-medium tracking-wide text-background uppercase">
                        Now
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {jobs.map((job) => {
                  const left = position(job.plannedStart!);
                  const right = position(job.plannedEnd!);
                  const width = Math.max(1.2, right - left);
                  if (right < 0 || left > 100) return null;
                  const muted = !visible(job);
                  const selected = selectedId === job.id;
                  const hasConflict = job.conflictCount > 0;
                  const materialIssue = job.materialReadiness === "SHORTAGE" || job.materialReadiness === "AT_RISK";
                  return (
                    <div
                      key={job.id}
                      className="absolute"
                      style={{
                        top: detailedBars ? "0.7rem" : "0.85rem",
                        left: `${Math.max(0, left)}%`,
                        width: `${Math.min(100 - Math.max(0, left), width)}%`,
                      }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => onSelect(job.id)}
                            aria-label={`${job.productName}, ${job.orderNumber}, ${statusLabel(job.displayStatus)}${job.isLocked ? ", locked" : ""}${materialIssue ? `, material ${readinessLabel(job.materialReadiness).toLowerCase()}` : ""}${hasConflict ? ", planning conflict" : ""}`}
                            className={cn(
                              "relative flex w-full flex-col justify-center overflow-hidden rounded-md px-2 text-left text-primary-foreground transition duration-150 before:absolute before:inset-y-0 before:left-0 before:w-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none",
                              detailedBars ? "h-11" : "h-8",
                              job.displayStatus === "AT_RISK" ? "bg-danger/85 before:bg-danger" : "bg-primary/82 before:bg-primary-foreground/70",
                              job.priority === "CRITICAL" && job.displayStatus !== "AT_RISK" ? "before:w-1 before:bg-material" : null,
                              materialIssue ? "ring-1 ring-inset ring-warning/60" : null,
                              hasConflict ? "ring-1 ring-inset ring-danger/50" : null,
                              job.isLocked ? "ring-1 ring-inset ring-primary-foreground/35" : null,
                              selected ? "z-20 ring-2 ring-ring" : "hover:z-10 hover:brightness-110",
                              muted ? "opacity-25" : "opacity-100"
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-1 truncate text-[11px] font-medium">
                              {job.isLocked ? <Lock className="size-3 shrink-0" aria-hidden /> : null}
                              {hasConflict ? <span className="pointer-events-none size-1.5 shrink-0 rounded-full bg-danger" aria-hidden /> : null}
                              {job.productName}
                            </span>
                            {detailedBars ? (
                              <span className="truncate text-[10px] text-primary-foreground/80">
                                {job.orderNumber} · {compactQty(job.quantity)}
                                {materialIssue ? ` · ${readinessLabel(job.materialReadiness)}` : ""}
                              </span>
                            ) : null}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6} className="max-w-64 flex-col items-start gap-1 py-2.5 text-left">
                          <p className="font-medium">{job.productName}</p>
                          <p>
                            {job.orderNumber} · {quantityLabel(job.quantity)}
                          </p>
                          <p>
                            {job.workstationName} · {clockLabel(job.plannedStart!)} – {clockLabel(job.plannedEnd!)}
                          </p>
                          <p>Due {shortDay(job.dueDate)}</p>
                          <p>{statusLabel(job.displayStatus)} · {productionStatusLabel(job.status)}</p>
                          {job.materialReadiness !== "READY" ? <p>Material: {readinessLabel(job.materialReadiness)}</p> : null}
                          {hasConflict ? <p>{job.conflictCount} planning conflict{job.conflictCount === 1 ? "" : "s"}</p> : null}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkstationLabel({
  name,
  utilization,
  scheduled,
  atRisk,
  conflictCount,
  stressed,
}: {
  name: string;
  utilization: number;
  scheduled: number;
  atRisk: number;
  conflictCount: number;
  stressed: boolean;
}) {
  return (
    <div className="sticky left-0 z-20 flex flex-col justify-center gap-0.5 border-r border-border bg-card px-3 py-2">
      <p className="text-xs font-semibold tracking-tight">{name}</p>
      <p className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", stressed ? "bg-warning" : "bg-muted-foreground/50")} aria-hidden />
        {utilization}% utilized
        {stressed ? <span className="text-warning">⚠</span> : null}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {scheduled} {scheduled === 1 ? "order" : "orders"}
        {atRisk > 0 ? ` · ${atRisk} at risk` : null}
        {conflictCount > 0 ? ` · ${conflictCount} conflict${conflictCount === 1 ? "" : "s"}` : null}
      </p>
    </div>
  );
}

function CompactCapacity({
  workstations,
  orders,
}: {
  workstations: Workstation[];
  orders: Order[];
}) {
  return (
    <section aria-label="Capacity" className="work-surface p-3.5">
      <h2 className="text-sm font-semibold tracking-tight">Capacity</h2>
      <ul className="mt-3 space-y-2.5">
        {workstations.map((ws) => {
          const count = orders.filter((order) => order.workstationId === ws.id && order.plannedStart).length;
          return (
            <li key={ws.id}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <p className="min-w-0 truncate font-medium">{ws.name}</p>
                <p className="tabular-nums text-muted-foreground">
                  {ws.utilization}% · {count}
                </p>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full duration-150", capacityBarClass(ws.capacityState))}
                  style={{ width: `${Math.min(100, ws.utilization)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CapacityView({ data }: { data: OperationsView }) {
  return (
    <ul className="grid min-w-0 gap-3 md:grid-cols-2">
      {data.workstations.map((ws) => {
        const lineOrders = data.orders.filter((order) => order.workstationId === ws.id && order.plannedStart && order.plannedEnd);
        const critical = lineOrders.filter((order) => order.priority === "CRITICAL").length;
        const remaining = Math.max(0, Math.round((ws.availableHours - ws.scheduledHours) * 10) / 10);
        const lastEnd = lineOrders.reduce<string | null>((latest, order) => {
          if (!order.plannedEnd) return latest;
          if (!latest || order.plannedEnd > latest) return order.plannedEnd;
          return latest;
        }, null);
        const nextAvailable =
          remaining <= 0 ? "No remaining capacity this window" : lastEnd ? `${shortDay(lastEnd)} · ${clockLabel(lastEnd)}` : "Window start";
        return (
          <li key={ws.id} className="work-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold tracking-tight">{ws.name}</p>
                <p className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">Utilization</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">{ws.utilization}%</p>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Available</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{ws.availableHours}h</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Scheduled</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{ws.scheduledHours}h</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Remaining</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{remaining}h</dd>
              </div>
            </dl>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full duration-150", capacityBarClass(ws.capacityState))}
                style={{ width: `${Math.min(100, ws.utilization)}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {lineOrders.length} production {lineOrders.length === 1 ? "order" : "orders"}
              {critical > 0 ? ` · ${critical} critical` : null}
            </p>
            <p className="mt-1 text-xs">
              Next available: <span className="tabular-nums">{nextAvailable}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function AttentionInbox({
  items,
  onAction,
  compact = false,
}: {
  items: AttentionItem[];
  onAction: (item: AttentionItem) => void;
  compact?: boolean;
}) {
  const shown = compact ? items.slice(0, 4) : items;
  return (
    <section aria-label="Planning attention" className="work-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Planning attention</h2>
        <p className="text-xs tabular-nums text-muted-foreground">{items.length}</p>
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No planning conflicts in this window.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {shown.map((item, index) => {
            const kind = attentionKind(item);
            return (
              <li key={`${item.orderNumber}-${item.title}-${index}`} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{kind.label}</p>
                  <StatusBadge tone={severityTone(item.severity)}>{item.severity}</StatusBadge>
                </div>
                <p className="mt-1.5 text-sm font-medium">{item.productName}</p>
                {item.orderNumber ? <p className="text-xs text-muted-foreground">{item.orderNumber}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
                <p className="mt-1 text-sm">{item.impact}</p>
                <Button type="button" size="sm" variant="outline" className="mt-3 min-h-11 sm:min-h-7" onClick={() => onAction(item)}>
                  {attentionAction(item)}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function UnscheduledList({
  orders,
  onSelect,
  windowStart,
  onAutoSchedule,
  busy,
}: {
  orders: Order[];
  onSelect: (id: string) => void;
  windowStart: string;
  onAutoSchedule: (url: string, init: RequestInit) => Promise<boolean>;
  busy: boolean;
}) {
  return (
    <section aria-label="Unscheduled orders" className="work-surface p-3.5">
      <h2 className="text-sm font-semibold tracking-tight">Unscheduled</h2>
      <ul className="mt-3 space-y-2">
        {orders.map((order) => (
          <li key={order.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
            <button
              type="button"
              onClick={() => onSelect(order.id)}
              className="min-w-0 flex-1 text-left focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block text-sm font-medium">{order.productName}</span>
              <span className="text-xs text-muted-foreground">
                {order.orderNumber} · Due {shortDay(order.dueDate)}
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge tone="neutral">Unscheduled</StatusBadge>
              {!order.isLocked && order.status !== "IN_PROGRESS" && order.status !== "COMPLETED" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-9"
                  disabled={busy}
                  onClick={() => onAutoSchedule(`/api/production-orders/${order.id}/auto-schedule`, { method: "POST", body: JSON.stringify({ windowStart }) })}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Schedule"}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OrderDetail({
  order,
  workstations,
  conflicts,
  busy,
  error,
  onResequence,
  onAutoSchedule,
  onUpdateWorkstation,
}: {
  order: Order;
  workstations: OperationsView["workstationsActive"];
  conflicts: AttentionItem[];
  busy: boolean;
  error: string | null;
  onResequence: (direction: "earlier" | "later") => Promise<boolean>;
  onAutoSchedule: () => Promise<boolean>;
  onUpdateWorkstation: (workstationId: string) => Promise<boolean>;
}) {
  const delay = delayDays(order);
  const durationHours = Math.round((order.durationMinutes / 60) * 10) / 10;
  const canPlan = !order.isLocked && order.status !== "IN_PROGRESS" && order.status !== "COMPLETED";

  return (
    <>
      <SheetHeader>
        <SheetTitle>{order.productName}</SheetTitle>
        <SheetDescription>Production order {order.orderNumber}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6 text-sm">
        <section>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Identity</p>
          <p className="mt-0.5 font-medium tabular-nums">{quantityLabel(order.quantity)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge tone={productionStatusTone(order.status)}>{productionStatusLabel(order.status)}</StatusBadge>
            <StatusBadge tone={order.priority === "CRITICAL" ? "danger" : "neutral"}>{order.priority}</StatusBadge>
          </div>
        </section>

        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Schedule</p>
          <p className="mt-0.5">
            {order.plannedStart && order.plannedEnd
              ? `${shortDay(order.plannedStart)} · ${clockLabel(order.plannedStart)} – ${clockLabel(order.plannedEnd)}`
              : "Not scheduled"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {order.workstationName ?? "Unassigned"} · {durationHours}h duration
          </p>
          {canPlan && workstations.length > 0 ? (
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Workstation</span>
              <select
                value={order.workstationId ?? ""}
                disabled={busy}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value) void onUpdateWorkstation(value);
                }}
                className="h-10 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                <option value="" disabled>
                  Select line
                </option>
                {workstations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>

        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Capacity</p>
          <p className="mt-0.5 capitalize">{order.capacityState === "UNKNOWN" ? "Unknown" : order.capacityState.toLowerCase()}</p>
          {conflicts.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {conflicts.map((item, index) => (
                <li key={`${item.kind}-${index}`} className="rounded-sm border border-border px-2.5 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{item.title}</span>
                    <StatusBadge tone={severityTone(item.severity)}>{item.severity}</StatusBadge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{item.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">No planning conflicts on this order.</p>
          )}
        </section>

        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Materials</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge tone={readinessTone(order.materialReadiness)}>{readinessLabel(order.materialReadiness)}</StatusBadge>
            {order.materialShortageCount > 0 ? (
              <span className="text-xs text-muted-foreground">{order.materialShortageCount} shortage{order.materialShortageCount === 1 ? "" : "s"}</span>
            ) : null}
          </div>
          {order.materialAffected.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{order.materialAffected.join(" · ")}</p>
          ) : order.materialReadiness === "UNKNOWN" ? (
            <p className="mt-2 text-xs text-muted-foreground">Material readiness cannot be confirmed from current BOM data.</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/materials?order=${order.id}`}>View material requirements</Link>
            </Button>
            {order.materialReadiness === "SHORTAGE" ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/procurement?order=${order.id}`}>View procurement</Link>
              </Button>
            ) : null}
          </div>
        </section>

        <section className="border-t border-border pt-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Delivery</p>
          <p className="mt-0.5">Due {shortDay(order.dueDate)}</p>
          {order.plannedEnd ? <p className="mt-0.5">Projected {shortDay(order.plannedEnd)}</p> : null}
          <p className="mt-2">
            <StatusBadge tone={statusTone(order.displayStatus)}>{statusLabel(order.displayStatus)}</StatusBadge>
          </p>
          {delay && delay > 0 ? <p className="mt-2 text-danger">{delay}-day delay</p> : null}
          <p className="mt-1 text-muted-foreground">{order.isLocked ? "Locked" : "Open for planning"}</p>
        </section>

        {canPlan ? (
          <section className="border-t border-border pt-3">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Planning actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!order.plannedStart ? (
                <Button type="button" size="sm" variant="default" disabled={busy} onClick={() => void onAutoSchedule()}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Auto-schedule"}
                </Button>
              ) : (
                <>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onResequence("earlier")}>
                    Move earlier
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void onResequence("later")}>
                    Move later
                  </Button>
                </>
              )}
            </div>
            {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
          </section>
        ) : null}
      </div>
    </>
  );
}
