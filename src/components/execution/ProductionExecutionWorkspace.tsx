"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { InspectionMetricGrid, InspectionSection } from "@/components/ds/inspection-section";
import { MetricStrip } from "@/components/ds/metric-strip";
import { ProcessTrail } from "@/components/ds/process-trail";
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
import { useCompactLayout } from "@/hooks/use-compact-layout";
import { cn } from "@/lib/utils";
import {
  EXECUTION_VIEWS,
  type ExecutionOrderRow,
  type ExecutionRisk,
  type ExecutionState,
  type ExecutionViewId,
  type ProductionExecutionSnapshot,
} from "@/lib/production-execution/types";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<ExecutionViewId, string> = {
  all: "All",
  active: "Active",
  paused: "Paused",
  waiting: "Waiting",
  completed: "Completed",
  "at-risk": "At risk",
};

const stateTone: Record<ExecutionState, StatusTone> = {
  WAITING: "neutral",
  RELEASED: "info",
  IN_PROGRESS: "primary",
  PAUSED: "material",
  COMPLETED: "success",
};

const stateLabel: Record<ExecutionState, string> = {
  WAITING: "Waiting",
  RELEASED: "Released",
  IN_PROGRESS: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
};

const riskTone: Record<ExecutionRisk, StatusTone> = {
  ON_TRACK: "intel",
  AT_RISK: "warning",
  LATE: "danger",
  BLOCKED: "danger",
  UNKNOWN: "neutral",
};

function formatMinutes(value: number | null): string {
  if (value == null) return "No data";
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatStamp(iso: string | null): string {
  if (!iso) return "Not recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function ProductionExecutionWorkspace({ data }: { data: ProductionExecutionSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("order"));
  const selected =
    data.orders.find((row) => row.id === selectedId) ??
    data.orders.find((row) => row.id === searchParams.get("order")) ??
    null;

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const sorted = useMemo(() => {
    const rank: Record<ExecutionRisk, number> = { LATE: 5, BLOCKED: 4, AT_RISK: 3, UNKNOWN: 2, ON_TRACK: 1 };
    const stateRank: Record<ExecutionState, number> = {
      PAUSED: 5,
      IN_PROGRESS: 4,
      RELEASED: 3,
      WAITING: 2,
      COMPLETED: 1,
    };
    return [...data.orders].sort(
      (a, b) =>
        rank[b.risk] - rank[a.risk] ||
        stateRank[b.executionState] - stateRank[a.executionState] ||
        (a.plannedEnd ?? "").localeCompare(b.plannedEnd ?? "")
    );
  }, [data.orders]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ProcessTrail
        steps={[
          { id: "plan", label: "Plan", href: "/operations" },
          { id: "execute", label: "Execute" },
          { id: "batch", label: "Batches", href: "/batches" },
          { id: "reports", label: "Reports", href: "/reports?view=production" },
        ]}
        current="execute"
      />

      {data.attention.length > 0 ? (
        <AttentionList title="Production attention">
          {data.attention.map((item) => (
            <AttentionItem
              key={item.id}
              domain="Production"
              severity={item.severity}
              issue={item.title}
              evidence={item.detail}
              consequence={item.consequence}
              href={item.href}
            />
          ))}
        </AttentionList>
      ) : null}

      <MetricStrip
        aria-label="Execution metrics"
        items={data.kpis.map((kpi) => ({
          id: kpi.id,
          label: kpi.label,
          value: kpi.value,
          hint: kpi.hint,
          tone: kpi.tone,
          href: href({ view: kpi.id === "at-risk" ? "at-risk" : kpi.id === "active" ? "active" : kpi.id === "paused" ? "paused" : kpi.id === "waiting" ? "waiting" : kpi.id === "completed" ? "completed" : undefined }),
        }))}
      />

      {data.nextTask ? (
        <section aria-label="Next task" className="min-w-0 work-surface p-3">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Next task</p>
          <p className="mt-1 text-sm font-medium">{data.nextTask.productName}</p>
          <p className="text-xs text-muted-foreground">
            {data.nextTask.orderNumber} · {data.nextTask.workstationName ?? "Unassigned"} ·{" "}
            {data.nextTask.plannedStart ? formatStamp(data.nextTask.plannedStart) : "Not scheduled"}
          </p>
          <Button type="button" size="sm" className="mt-3 min-h-11 sm:min-h-7" onClick={() => setSelectedId(data.nextTask!.id)}>
            Open next task
          </Button>
        </section>
      ) : null}

      <section aria-label="Planned vs actual" className="min-w-0 work-surface p-3">
        <p className="text-sm font-medium">Planned vs actual</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.performance.map((row) => (
            <div key={row.id} className="rounded-sm border border-border px-3 py-2.5">
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{row.label}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Planned</dt>
                  <dd className="tabular-nums font-medium">
                    {row.planned == null ? "No data" : row.unit === "minutes" ? formatMinutes(row.planned) : row.planned.toLocaleString("en-GB")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Actual</dt>
                  <dd className="tabular-nums font-medium">
                    {row.actual == null ? "No data" : row.unit === "minutes" ? formatMinutes(row.actual) : row.actual.toLocaleString("en-GB")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Variance</dt>
                  <dd className="tabular-nums font-medium">
                    {row.planned == null || row.actual == null
                      ? "No data"
                      : row.unit === "minutes"
                        ? formatMinutes(row.actual - row.planned)
                        : (row.actual - row.planned).toLocaleString("en-GB")}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-3 work-surface p-3">
        <nav aria-label="Execution views" className="flex min-w-0 flex-wrap gap-1">
          {EXECUTION_VIEWS.map((view) => (
            <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-7">
              <Link href={href({ view: view === "all" ? undefined : view })}>{VIEW_LABEL[view]}</Link>
            </Button>
          ))}
        </nav>
        <SearchInput
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Order, product, workstation"
          aria-label="Search production execution"
          className="md:max-w-56 [&_input]:h-11 md:[&_input]:h-8"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              router.push(href({ q: event.currentTarget.value || undefined }));
            }
          }}
        />
        {data.workstations.length > 0 ? (
          <label className="flex min-w-0 items-center gap-2 text-xs font-medium">
            <span className="shrink-0 text-muted-foreground">Station</span>
            <select
              value={data.workstationId ?? ""}
              onChange={(event) => router.push(href({ workstation: event.target.value || undefined }))}
              className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8 md:max-w-56"
            >
              <option value="">All stations</option>
              {data.workstations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="No production orders to show" description="Adjust filters or schedule work in Operations." />
      ) : compact ? (
        <ul aria-label="Production execution board" className="min-w-0 divide-y divide-border work-surface">
          {sorted.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="flex min-h-11 w-full flex-col gap-2 px-3 py-3 text-left"
                aria-label={`Inspect ${row.orderNumber}`}
                onClick={() => setSelectedId(row.id)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={stateTone[row.executionState]}>{stateLabel[row.executionState]}</StatusBadge>
                  <StatusBadge tone={riskTone[row.risk]}>{row.risk.replace(/_/g, " ")}</StatusBadge>
                  <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{row.priority}</span>
                </div>
                <p className="font-medium">{row.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {row.orderNumber} · {row.workstationName ?? "No workstation"} · {row.plannedQuantity.toLocaleString("en-GB")} {row.unit}
                </p>
                <ProgressMeter percent={row.progressPercent} label={row.progressLabel} />
                <PrimaryAction row={row} onDone={() => router.refresh()} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="min-w-0 overflow-hidden work-surface">
          <div className="overflow-x-auto">
            <table className="ops-table min-w-[72rem]" aria-label="Production execution board">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Product</th>
                  <th className="text-right">Qty</th>
                  <th>Progress</th>
                  <th>Workstation</th>
                  <th>Risk</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <StatusBadge tone={stateTone[row.executionState]}>{stateLabel[row.executionState]}</StatusBadge>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Inspect ${row.orderNumber}`}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <span className="block font-medium">{row.productName}</span>
                        <span className="text-xs text-muted-foreground">{row.orderNumber}</span>
                      </button>
                    </td>
                    <td className="text-right tabular-nums">
                      {row.plannedQuantity.toLocaleString("en-GB")}
                      <span className="ml-1 text-xs text-muted-foreground">{row.unit}</span>
                    </td>
                    <td className="min-w-[9rem]">
                      <ProgressMeter percent={row.progressPercent} label={row.progressLabel} />
                    </td>
                    <td>{row.workstationName ?? "Not assigned"}</td>
                    <td>
                      <StatusBadge tone={riskTone[row.risk]}>{row.risk.replace(/_/g, " ")}</StatusBadge>
                    </td>
                    <td>
                      <PrimaryAction row={row} onDone={() => router.refresh()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[85vh] overflow-y-auto sm:max-w-none" : "overflow-y-auto sm:max-w-lg"}
        >
          {selected ? <ExecutionDetail row={selected} canExecute={data.capabilities.canExecute} onComplete={() => router.refresh()} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PrimaryAction({ row, onDone }: { row: ExecutionOrderRow; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const action =
    row.canRelease
      ? ("release" as const)
      : row.canStart
        ? ("start" as const)
        : row.canResume
          ? ("resume" as const)
          : row.canPause
            ? ("pause" as const)
            : row.canComplete
              ? ("complete" as const)
              : null;

  if (!action) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const label = action.charAt(0).toUpperCase() + action.slice(1);

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        className="min-h-11 sm:min-h-8"
        disabled={pending}
        onClick={(event) => {
          event.stopPropagation();
          setError(null);
          startTransition(async () => {
            try {
              const body =
                action === "complete" && row.batchId
                  ? { producedQuantity: row.producedQuantity ?? row.plannedQuantity }
                  : {};
              const response = await fetch(`/api/production-orders/${row.id}/${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              const payload = (await response.json()) as { message?: string };
              if (!response.ok) {
                setError(payload.message ?? "Unable to update execution.");
                return;
              }
              onDone();
            } catch {
              setError("Unable to update execution.");
            }
          });
        }}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : label}
      </Button>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}

function ExecutionDetail({
  row,
  canExecute,
  onComplete,
}: {
  row: ExecutionOrderRow;
  canExecute: boolean;
  onComplete: () => void;
}) {
  const [producedQuantity, setProducedQuantity] = useState(String(row.producedQuantity ?? row.plannedQuantity));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function mutate(path: "release" | "start" | "pause" | "resume" | "complete") {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const body =
          path === "complete"
            ? { producedQuantity: row.batchId ? Number(producedQuantity) : undefined }
            : {};
        const response = await fetch(`/api/production-orders/${row.id}/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as { message?: string };
        if (!response.ok) {
          setError(payload.message ?? "Unable to update execution.");
          return;
        }
        setMessage(payload.message ?? "Execution updated.");
        onComplete();
      } catch {
        setError("Unable to update execution.");
      }
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{row.orderNumber}</SheetTitle>
        <SheetDescription>
          {row.productName} · {row.productSku}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-1 px-4 pb-6 text-sm">
        <InspectionSection title="Status">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={stateTone[row.executionState]}>{stateLabel[row.executionState]}</StatusBadge>
            <StatusBadge tone={riskTone[row.risk]}>{row.risk.replace(/_/g, " ")}</StatusBadge>
            <StatusBadge tone="neutral">{row.priority}</StatusBadge>
          </div>
        </InspectionSection>

        <InspectionSection title="Identity">
          <InspectionMetricGrid
            items={[
              { label: "Product", value: row.productName },
              { label: "Order", value: row.orderNumber },
              { label: "Priority", value: row.priority },
              { label: "Workstation", value: row.workstationName ?? "Not assigned" },
              { label: "Batch", value: row.batchNumber ?? "No data" },
              { label: "Planning status", value: row.planningStatus.replace(/_/g, " ") },
            ]}
          />
        </InspectionSection>

        <InspectionSection title="Key metrics">
          <InspectionMetricGrid
            items={[
              { label: "State", value: stateLabel[row.executionState] },
              { label: "Progress", value: row.progressLabel },
              { label: "Planned start", value: formatStamp(row.plannedStart) },
              { label: "Planned end", value: formatStamp(row.plannedEnd) },
              { label: "Actual start", value: formatStamp(row.actualStart) },
              { label: "Actual completion", value: formatStamp(row.actualCompletion) },
              { label: "Planned qty", value: `${row.plannedQuantity.toLocaleString("en-GB")} ${row.unit}` },
              {
                label: "Produced qty",
                value: row.producedQuantity == null ? "Not recorded" : `${row.producedQuantity.toLocaleString("en-GB")} ${row.unit}`,
              },
              { label: "Planned duration", value: formatMinutes(row.plannedDurationMinutes) },
              { label: "Actual duration", value: formatMinutes(row.actualDurationMinutes) },
              { label: "Duration variance", value: formatMinutes(row.durationVarianceMinutes) },
              {
                label: "Quantity variance",
                value: row.quantityVariance == null ? "No data" : row.quantityVariance.toLocaleString("en-GB"),
              },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">{row.riskEvidence}</p>
        </InspectionSection>

        <InspectionSection title="Context">
          <InspectionMetricGrid
            items={[
              { label: "Materials", value: row.materialReadiness?.replace(/_/g, " ") ?? "Unknown" },
              { label: "Batch link", value: row.batchId ? "Available" : "No data" },
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
              <Link href={`/operations?order=${row.id}`}>Open in Operations</Link>
            </Button>
            {row.batchId ? (
              <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-8">
                <Link href={`/batches?batch=${row.batchId}`}>Open batch</Link>
              </Button>
            ) : null}
          </div>
        </InspectionSection>

        <InspectionSection title="History">
          {row.history.length === 0 ? (
            <p className="text-muted-foreground">No execution transitions recorded.</p>
          ) : (
            <ul className="space-y-2">
              {row.history.map((entry) => (
                <li key={entry.id} className="rounded-sm border border-border px-2 py-1.5 text-xs">
                  <p className="font-medium">{entry.label}</p>
                  <p className="text-muted-foreground">
                    {formatStamp(entry.at)} · {entry.actorName ?? "Unknown actor"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </InspectionSection>

        {canExecute ? (
          <InspectionSection title="Actions">
            {row.canComplete && row.batchId ? (
              <label className="block text-xs">
                Produced quantity
                <input
                  type="number"
                  min={0}
                  max={row.plannedQuantity}
                  value={producedQuantity}
                  onChange={(event) => setProducedQuantity(event.target.value)}
                  className="mt-1 flex h-11 w-full rounded-sm border border-border bg-background px-3 text-sm tabular-nums sm:h-8"
                />
              </label>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {row.canRelease ? (
                <Button className="min-h-11 sm:min-h-8" disabled={pending} onClick={() => mutate("release")}>
                  Release
                </Button>
              ) : null}
              {row.canStart ? (
                <Button className="min-h-11 sm:min-h-8" disabled={pending} onClick={() => mutate("start")}>
                  Start
                </Button>
              ) : null}
              {row.canPause ? (
                <Button className="min-h-11 sm:min-h-8" variant="secondary" disabled={pending} onClick={() => mutate("pause")}>
                  Pause
                </Button>
              ) : null}
              {row.canResume ? (
                <Button className="min-h-11 sm:min-h-8" disabled={pending} onClick={() => mutate("resume")}>
                  Resume
                </Button>
              ) : null}
              {row.canComplete ? (
                <Button className="min-h-11 sm:min-h-8" disabled={pending} onClick={() => mutate("complete")}>
                  Complete
                </Button>
              ) : null}
              {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            </div>
            {message ? <p className="mt-2 text-xs text-success">{message}</p> : null}
            {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
          </InspectionSection>
        ) : (
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">View only — execution actions require production.execute.</p>
        )}
      </div>
    </>
  );
}

function ProgressMeter({ percent, label }: { percent: number | null; label: string }) {
  const width = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className="min-w-0 space-y-1">
      <div className="progress-track" aria-hidden>
        <div
          className={cn("progress-fill", percent == null && "bg-muted-foreground/30")}
          style={{ width: `${percent == null ? 8 : width}%` }}
        />
      </div>
      <p className="text-[11px] tabular-nums text-muted-foreground">{label}</p>
    </div>
  );
}
