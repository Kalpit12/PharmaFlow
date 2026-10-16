"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ColumnChart } from "@/components/charts/ColumnChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlannerWidgetType } from "@prisma/client";

import {
  downloadPlannerDashboardCsv,
  openPlannerDashboardPdfPrint,
} from "@/lib/operations/planner-dashboard-export";
import { PLANNER_WIDGET_CATALOG, widgetLabel } from "@/lib/operations/planner-widgets";
import { cn } from "@/lib/utils";
import type { PlannerDashboardPageData } from "@/lib/server/planner-dashboards";

type ReportFocus = "all" | "timelogs" | "job" | "order-items" | "predicted";

const REPORT_FOCUS_WIDGETS: Record<Exclude<ReportFocus, "all" | "predicted">, PlannerWidgetType[]> = {
  timelogs: ["TIMELOG_REPORT"],
  job: ["JOB_REPORT"],
  "order-items": ["ORDER_ITEM_REPORT"],
};

function parseReportFocus(value: string | null): ReportFocus {
  if (value === "timelogs" || value === "job" || value === "order-items" || value === "predicted") return value;
  return "all";
}

function formatStamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Nairobi",
  });
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function ratioClass(ratio: number | null): string {
  if (ratio == null) return "text-muted-foreground";
  if (ratio <= 1) return "text-emerald-600 dark:text-emerald-400";
  if (ratio <= 1.2) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function PlannerDashboardBuilder({ initial }: { initial: PlannerDashboardPageData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportFocus = parseReportFocus(searchParams.get("report"));
  const [page, setPage] = useState(initial);
  const [editMode, setEditMode] = useState(false);
  const [dragType, setDragType] = useState<PlannerWidgetType | null>(null);
  const [dateFrom, setDateFrom] = useState(
    initial.active.dateFrom?.slice(0, 10) ?? initial.snapshot.window.start.slice(0, 10)
  );
  const [dateTo, setDateTo] = useState(
    initial.active.dateTo?.slice(0, 10) ?? initial.snapshot.window.end.slice(0, 10)
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const data = page.snapshot;
  const widgets = useMemo(() => {
    const base = page.active.widgets;
    if (reportFocus === "predicted") return [];
    if (reportFocus === "all") return base;
    const focusSet = new Set(REPORT_FOCUS_WIDGETS[reportFocus]);
    const focused = base.filter((type) => focusSet.has(type));
    return focused.length > 0 ? focused : REPORT_FOCUS_WIDGETS[reportFocus];
  }, [page.active.widgets, reportFocus]);

  const reportHref = (focus: ReportFocus) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", "dashboard");
    if (focus === "all") next.delete("report");
    else next.set("report", focus);
    const dashboard = searchParams.get("dashboard");
    if (dashboard) next.set("dashboard", dashboard);
    return `/operations?${next.toString()}`;
  };

  const saveDashboard = useCallback(
    (patch: { widgets?: PlannerWidgetType[]; dateFrom?: string | null; dateTo?: string | null; name?: string }) => {
      startTransition(async () => {
        setMessage(null);
        const response = await fetch(`/api/planner-dashboards/${page.active.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
          setMessage(payload.message ?? "Save failed.");
          return;
        }
        setMessage("Dashboard saved.");
        router.refresh();
      });
    },
    [page.active.id, router]
  );

  const onDropWidget = (targetType: PlannerWidgetType) => {
    if (!editMode || !dragType || dragType === targetType) return;
    const next = [...widgets];
    const from = next.indexOf(dragType);
    const to = next.indexOf(targetType);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragType);
    setPage((prev) => ({ ...prev, active: { ...prev.active, widgets: next } }));
    setDragType(null);
  };

  const addWidget = (type: PlannerWidgetType) => {
    if (widgets.includes(type)) return;
    const next = [...widgets, type];
    setPage((prev) => ({ ...prev, active: { ...prev.active, widgets: next } }));
  };

  const removeWidget = (type: PlannerWidgetType) => {
    setPage((prev) => ({
      ...prev,
      active: { ...prev.active, widgets: prev.active.widgets.filter((row) => row !== type) },
    }));
  };

  const widgetBlocks = useMemo(() => {
    const blocks: Record<string, ReactNode> = {
      KPI_STRIP: (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.kpis.map((kpi) => (
            <div key={kpi.id} className="work-surface p-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{kpi.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
            </div>
          ))}
        </section>
      ),
      CAPACITY_LOAD_FACTOR: (
        <ColumnChart
          title="Capacity load factor (14 days)"
          description="Daily scheduled load ÷ total workstation capacity (%)"
          rows={data.dailyLoad}
          valueSuffix="%"
          embedded
          dominant
          maxColumns={14}
        />
      ),
      WORKSTATION_UTILIZATION: (
        <HorizontalBarChart
          title="Load by workstation"
          description="Finite-capacity utilization in the date range"
          rows={data.workstationLoad}
          valueSuffix="%"
          embedded
        />
      ),
      BOTTLENECK: data.bottleneck ? (
        <section className="work-surface p-4">
          <p className="text-sm font-medium">Bottleneck workstation</p>
          <p className="mt-2 text-lg">
            {data.bottleneck.code} · {data.bottleneck.name} · {data.bottleneck.utilization}% utilization
          </p>
        </section>
      ) : null,
      OEE_BY_WORKSTATION: !data.hasTimelogData ? (
        <section className="work-surface p-4">
          <p className="text-sm font-medium">OEE by workstation</p>
          <p className="mt-2 text-sm text-muted-foreground">
            OEE appears after shop-floor timelogs (start/complete events) are recorded. No timer data in the last 30 days yet.
          </p>
        </section>
      ) : (
        <section className="work-surface overflow-x-auto p-4">
          <p className="text-sm font-medium">OEE proxy by workstation</p>
          <table className="mt-3 w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4">Workstation</th>
                <th className="pb-2 pr-4">OEE</th>
                <th className="pb-2 pr-4">A</th>
                <th className="pb-2 pr-4">P</th>
                <th className="pb-2">Q</th>
              </tr>
            </thead>
            <tbody>
              {data.oeeByWorkstation.slice(0, 12).map((row) => (
                <tr key={row.workstationId} className="border-t border-border/60">
                  <td className="py-2 pr-4">
                    {row.code} · {row.name}
                  </td>
                  <td className="py-2 pr-4">{row.oeePercent}%</td>
                  <td className="py-2 pr-4">{row.availabilityPercent}%</td>
                  <td className="py-2 pr-4">{row.performancePercent}%</td>
                  <td className="py-2">{row.qualityPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ),
      JOB_REPORT: (
        <section className="work-surface overflow-x-auto p-4">
          <p className="text-sm font-medium">Job report (by step)</p>
          <table className="mt-3 w-full min-w-[880px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 pr-3">Order</th>
                <th className="pb-2 pr-3">Step</th>
                <th className="pb-2 pr-3">Workstation</th>
                <th className="pb-2 pr-3">Planned</th>
                <th className="pb-2 pr-3">Logged</th>
                <th className="pb-2">Difference</th>
              </tr>
            </thead>
            <tbody>
              {data.jobReportSteps.map((row) => (
                <tr key={row.id} className="border-t border-border/60">
                  <td className="py-2 pr-3 font-medium">{row.orderNumber}</td>
                  <td className="py-2 pr-3">
                    {row.stepCode} · {row.stepName}
                  </td>
                  <td className="py-2 pr-3">{row.workstationName ?? "—"}</td>
                  <td className="py-2 pr-3">{formatMinutes(row.plannedMinutes)}</td>
                  <td className="py-2 pr-3">{row.loggedMinutes > 0 ? formatMinutes(row.loggedMinutes) : "—"}</td>
                  <td className={cn("py-2 font-medium tabular-nums", ratioClass(row.ratio))}>
                    {row.ratio == null ? "—" : row.ratio.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ),
      TIMELOG_REPORT: (
        <section className="work-surface overflow-x-auto p-4">
          <p className="text-sm font-medium">All timelogs</p>
          {data.timelogs.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No events in the last 30 days.</p>
          ) : (
            <table className="mt-3 w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-3">When</th>
                  <th className="pb-2 pr-3">Event</th>
                  <th className="pb-2 pr-3">Order</th>
                  <th className="pb-2">Workstation</th>
                </tr>
              </thead>
              <tbody>
                {data.timelogs.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-2 pr-3">{formatStamp(row.recordedAt)}</td>
                    <td className="py-2 pr-3">{row.eventType}</td>
                    <td className="py-2 pr-3">
                      {row.orderNumber} · {row.operationCode}
                    </td>
                    <td className="py-2">{row.workstationName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ),
      ORDER_ITEM_REPORT: (
        <section className="work-surface overflow-x-auto p-4">
          <p className="text-sm font-medium">Order item report</p>
          <table className="mt-3 w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 pr-3">Order</th>
                <th className="pb-2 pr-3">SKU</th>
                <th className="pb-2 pr-3">Product</th>
                <th className="pb-2 pr-3">Qty</th>
                <th className="pb-2">Due</th>
              </tr>
            </thead>
            <tbody>
              {data.orderItems.map((row) => (
                <tr key={row.id} className="border-t border-border/60">
                  <td className="py-2 pr-3">{row.orderNumber}</td>
                  <td className="py-2 pr-3">{row.productSku}</td>
                  <td className="py-2 pr-3">{row.productName}</td>
                  <td className="py-2 pr-3">{row.quantity.toLocaleString("en-KE")}</td>
                  <td className="py-2">{formatStamp(row.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ),
    };
    for (const kpi of data.kpis) {
      if (kpi.id === "otif") blocks.OTIF = (
        <div className="work-surface p-4">
          <p className="text-xs text-muted-foreground">{kpi.label}</p>
          <p className="mt-1 text-2xl font-semibold">{kpi.value}</p>
        </div>
      );
      if (kpi.id === "adherence") blocks.SCHEDULE_ADHERENCE = (
        <div className="work-surface p-4">
          <p className="text-xs text-muted-foreground">{kpi.label}</p>
          <p className="mt-1 text-2xl font-semibold">{kpi.value}</p>
        </div>
      );
      if (kpi.id === "late") blocks.LATE_JOBS = (
        <div className="work-surface p-4">
          <p className="text-xs text-muted-foreground">{kpi.label}</p>
          <p className="mt-1 text-2xl font-semibold">{kpi.value}</p>
        </div>
      );
      if (kpi.id === "changeover") blocks.CHANGEOVER_HOURS = (
        <div className="work-surface p-4">
          <p className="text-xs text-muted-foreground">{kpi.label}</p>
          <p className="mt-1 text-2xl font-semibold">{kpi.value}</p>
        </div>
      );
      if (kpi.id === "started" || kpi.id === "completed") {
        blocks.JOBS_STARTED_COMPLETED = (
          <section className="grid gap-3 sm:grid-cols-2">
            {data.kpis
              .filter((row) => row.id === "started" || row.id === "completed")
              .map((row) => (
                <div key={row.id} className="work-surface p-4">
                  <p className="text-xs text-muted-foreground">{row.label}</p>
                  <p className="mt-1 text-2xl font-semibold">{row.value}</p>
                </div>
              ))}
          </section>
        );
      }
    }
    return blocks;
  }, [data]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <nav
        className="flex flex-wrap gap-2 px-1"
        aria-label="Planner reports"
      >
        {(
          [
            ["all", "Overview"],
            ["timelogs", "All timelogs"],
            ["job", "Job report"],
            ["order-items", "Order item report"],
            ["predicted", "Predicted vs realized"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            asChild
            size="sm"
            variant={reportFocus === id ? "secondary" : "outline"}
          >
            <Link href={reportHref(id)}>{label}</Link>
          </Button>
        ))}
      </nav>
      <section className="work-surface flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[160px] flex-1">
          <Label htmlFor="dashboard-select">Dashboard</Label>
          <select
            id="dashboard-select"
            className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-2 text-sm"
            value={page.active.id}
            onChange={(event) => router.push(`/operations?dashboard=${event.target.value}#dashboard`)}
          >
            {page.dashboards.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="date-from">From</Label>
          <Input id="date-from" type="date" className="mt-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="date-to">To</Label>
          <Input id="date-to" type="date" className="mt-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            saveDashboard({
              dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : null,
              dateTo: dateTo ? `${dateTo}T23:59:59.000Z` : null,
            })
          }
        >
          Apply dates
        </Button>
        {page.canEdit ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditMode((value) => !value)}>
            {editMode ? "Done editing" : "Edit layout"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => downloadPlannerDashboardCsv(data, `${page.active.name}-dashboard.csv`)}
        >
          Export CSV
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => openPlannerDashboardPdfPrint(data, page.active.name)}>
          Export PDF
        </Button>
        {page.canEdit ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await fetch("/api/planner-dashboards", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: "New dashboard", cloneFromId: page.active.id }),
                });
                router.refresh();
              });
            }}
          >
            New dashboard
          </Button>
        ) : null}
        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      </section>

      {reportFocus === "predicted" ? (
        <section className="work-surface overflow-x-auto p-4">
          <p className="text-sm font-medium">Predicted vs realized</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare planned step durations with shop-floor logged time. When enough timelogs exist, head planners can
            apply rolling averages as new routing defaults (audited).
          </p>
          <table className="mt-3 w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 pr-3">Step</th>
                <th className="pb-2 pr-3">Workstation</th>
                <th className="pb-2 pr-3">Predicted avg</th>
                <th className="pb-2 pr-3">Realized avg</th>
                <th className="pb-2">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(
                data.jobReportSteps.reduce((map, row) => {
                  const key = `${row.stepCode}|${row.workstationName ?? ""}`;
                  const entry = map.get(key) ?? { stepCode: row.stepCode, stepName: row.stepName, ws: row.workstationName, planned: 0, logged: 0, count: 0, loggedCount: 0 };
                  entry.planned += row.plannedMinutes;
                  entry.count += 1;
                  if (row.loggedMinutes > 0) {
                    entry.logged += row.loggedMinutes;
                    entry.loggedCount += 1;
                  }
                  map.set(key, entry);
                  return map;
                }, new Map<string, { stepCode: string; stepName: string; ws: string | null; planned: number; logged: number; count: number; loggedCount: number }>())
              ).map(([key, row]) => {
                const predicted = row.count > 0 ? Math.round(row.planned / row.count) : 0;
                const realized = row.loggedCount > 0 ? Math.round(row.logged / row.loggedCount) : null;
                const ratio = realized != null && predicted > 0 ? realized / predicted : null;
                return (
                  <tr key={key} className="border-t border-border/60">
                    <td className="py-2 pr-3">
                      {row.stepCode} · {row.stepName}
                    </td>
                    <td className="py-2 pr-3">{row.ws ?? "—"}</td>
                    <td className="py-2 pr-3">{formatMinutes(predicted)}</td>
                    <td className="py-2 pr-3">{realized != null ? formatMinutes(realized) : "—"}</td>
                    <td className={cn("py-2 font-medium tabular-nums", ratioClass(ratio))}>
                      {ratio == null ? "—" : ratio.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {editMode && page.canEdit ? (
        <section className="work-surface p-4">
          <p className="text-sm font-medium">Add widget</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLANNER_WIDGET_CATALOG.filter((row) => !widgets.includes(row.type)).map((row) => (
              <Button key={row.type} type="button" size="sm" variant="outline" onClick={() => addWidget(row.type)}>
                + {row.label}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            className="mt-3"
            size="sm"
            disabled={pending}
            onClick={() => saveDashboard({ widgets })}
          >
            Save layout
          </Button>
        </section>
      ) : null}

      <div className="flex flex-col gap-4">
        {widgets.map((type) => {
          const block = widgetBlocks[type];
          if (!block) return null;
          return (
            <div
              key={type}
              draggable={editMode}
              onDragStart={() => setDragType(type)}
              onDragOver={(event) => editMode && event.preventDefault()}
              onDrop={() => onDropWidget(type)}
              className={editMode ? "rounded-sm ring-1 ring-dashed ring-border/80" : undefined}
            >
              {editMode ? (
                <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground">
                  <span>{widgetLabel(type)} — drag to reorder</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeWidget(type)}>
                    Remove
                  </Button>
                </div>
              ) : null}
              {block}
            </div>
          );
        })}
      </div>
    </div>
  );
}
