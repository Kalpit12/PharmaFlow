"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
import { ProcessTrail } from "@/components/ds/process-trail";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import { dueStateLabel, statusLabel, typeLabel } from "@/lib/quality/service";
import {
  QUALITY_EXCEPTION_TYPES,
  QUALITY_EXCEPTION_SEVERITIES,
  QUALITY_VIEWS,
  type QualityExceptionRow,
  type QualityExceptionSeverity,
  type QualityExceptionStatus,
  type QualityExceptionType,
  type QualitySnapshot,
  type QualityViewId,
} from "@/lib/quality/types";
import { confidenceLabel, scopeLabel } from "@/lib/traceability/impact";
import type { StatusTone } from "@/types/status";

const VIEW_LABEL: Record<QualityViewId, string> = {
  all: "All exceptions",
  open: "Open",
  critical: "Critical / high",
  overdue: "Overdue",
  unassigned: "Unassigned",
};

const severityTone: Record<QualityExceptionSeverity, StatusTone> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "material",
  LOW: "intel",
};

const statusTone: Record<QualityExceptionStatus, StatusTone> = {
  OPEN: "info",
  INVESTIGATING: "material",
  ACTION_REQUIRED: "warning",
  RESOLVED: "intel",
  CLOSED: "intel",
};

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function QualityWorkspace({ data }: { data: QualitySnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("exception"));
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logTitle, setLogTitle] = useState("");
  const [logDescription, setLogDescription] = useState("");
  const [logType, setLogType] = useState<QualityExceptionType>("BATCH_ISSUE");
  const [logSeverity, setLogSeverity] = useState<QualityExceptionSeverity>("HIGH");
  const [logBatchId, setLogBatchId] = useState(data.batchOptions[0]?.id ?? "");
  const selected =
    data.exceptions.find((row) => row.id === selectedId) ??
    data.exceptions.find((row) => row.id === searchParams.get("exception")) ??
    null;

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };

  const sorted = useMemo(() => {
    const rank: Record<QualityExceptionSeverity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return [...data.exceptions].sort(
      (a, b) => rank[b.severity] - rank[a.severity] || b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [data.exceptions]);

  async function submitException() {
    if (logTitle.trim().length < 3 || logDescription.trim().length < 3) {
      setError("Title and description are required.");
      return;
    }
    const ok = await mutate("/api/quality/exceptions", "POST", {
      title: logTitle.trim(),
      description: logDescription.trim(),
      type: logType,
      severity: logSeverity,
      productionBatchId: logBatchId || null,
    });
    if (ok) {
      setLogOpen(false);
      setLogTitle("");
      setLogDescription("");
    }
  }

  async function mutate(url: string, method: string, body?: object) {
    setError(null);
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(payload.message ?? "Unable to complete the request.");
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ProcessTrail
        steps={[
          { id: "production", label: "Production", href: "/operations" },
          { id: "batch", label: "Batch", href: "/batches" },
          { id: "quality", label: "Quality" },
          { id: "traceability", label: "Traceability", href: "/traceability" },
          { id: "resolution", label: "Resolution" },
        ]}
        current="quality"
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <nav aria-label="Quality views" className="flex flex-wrap gap-1">
          {QUALITY_VIEWS.map((view) => (
            <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-7">
              <Link href={href({ view: view === "all" ? undefined : view })}>{VIEW_LABEL[view]}</Link>
            </Button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {data.capabilities.canManage ? (
            <Button type="button" size="sm" className="min-h-11 sm:min-h-7" onClick={() => setLogOpen(true)}>
              Log exception
            </Button>
          ) : null}
          <SearchInput
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Reference, batch, product, owner"
            aria-label="Search quality exceptions"
            className="md:max-w-56 [&_input]:h-11 md:[&_input]:h-8"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                router.push(href({ q: event.currentTarget.value || undefined }));
              }
            }}
          />
        </div>
      </div>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log quality exception</DialogTitle>
            <DialogDescription>Operational exception record — not a validated QMS submission.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Title</span>
              <Input value={logTitle} onChange={(event) => setLogTitle(event.target.value)} maxLength={160} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Description</span>
              <textarea
                className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={logDescription}
                onChange={(event) => setLogDescription(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Type</span>
              <select
                className="h-9 rounded-md border border-border bg-background px-2"
                value={logType}
                onChange={(event) => setLogType(event.target.value as QualityExceptionType)}
              >
                {QUALITY_EXCEPTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {typeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Severity</span>
              <select
                className="h-9 rounded-md border border-border bg-background px-2"
                value={logSeverity}
                onChange={(event) => setLogSeverity(event.target.value as QualityExceptionSeverity)}
              >
                {QUALITY_EXCEPTION_SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
            </label>
            {data.batchOptions.length > 0 ? (
              <label className="grid gap-1.5 text-sm">
                <span className="text-muted-foreground">Linked batch (optional)</span>
                <select
                  className="h-9 rounded-md border border-border bg-background px-2"
                  value={logBatchId}
                  onChange={(event) => setLogBatchId(event.target.value)}
                >
                  <option value="">None</option>
                  {data.batchOptions.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.batchNumber} · {batch.productName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={() => void submitException()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Log exception"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section aria-label="Quality metrics" className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {data.kpis.map((kpi) => (
          <div key={kpi.id} className="min-w-[9.5rem] shrink-0 border-r border-border px-3.5 py-3 last:border-r-0 xl:min-w-0">
            <p className="min-w-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{kpi.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </section>

      {data.attention.length > 0 ? (
        <section aria-label="Quality attention" className="min-w-0 work-surface p-3">
          <p className="text-sm font-medium">Quality attention</p>
          <ul className="mt-2 divide-y divide-border">
            {data.attention.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={item.severity === "CRITICAL" ? "danger" : item.severity === "HIGH" ? "danger" : "warning"}>
                      {item.severity}
                    </StatusBadge>
                    <p className="font-medium">{item.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <Link href={item.href} className="text-xs hover:underline">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1fr_16rem]">
        {sorted.length === 0 ? (
          <EmptyState title="No quality exceptions to show" description={data.emptyReason ?? "Adjust filters or record a new exception."} />
        ) : (
          <div className="min-w-0 overflow-hidden work-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-sm" aria-label="Quality exceptions table">
                <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2 font-medium">Reference</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Severity</th>
                    <th className="px-3 py-2 font-medium">Entity</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium">Due</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          aria-label={`Inspect exception ${row.reference}`}
                          onClick={() => {
                            setSelectedId(row.id);
                            router.push(href({ exception: row.id }));
                          }}
                        >
                          <p className="font-medium">{row.reference}</p>
                          <p className="text-xs text-muted-foreground">{row.title}</p>
                        </button>
                      </td>
                      <td className="px-3 py-2">{typeLabel(row.type)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={severityTone[row.severity]}>{row.severity}</StatusBadge>
                      </td>
                      <td className="px-3 py-2">{row.entity.entityLabel}</td>
                      <td className="px-3 py-2">{row.ownerName ?? "UNASSIGNED"}</td>
                      <td className="px-3 py-2">
                        <p>{formatDay(row.dueDate)}</p>
                        <p className="text-xs text-muted-foreground">{dueStateLabel(row.dueState)}</p>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={statusTone[row.status]}>{statusLabel(row.status)}</StatusBadge>
                      </td>
                      <td className="px-3 py-2">{formatDay(row.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <aside className="min-w-0 work-surface p-4">
          <p className="text-sm font-medium">Distribution</p>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">By severity</p>
              <ul className="mt-2 space-y-1 text-sm">
                {data.severityDistribution.map((slice) => (
                  <li key={slice.label} className="flex justify-between gap-2">
                    <span>{slice.label}</span>
                    <span className="tabular-nums">{slice.value}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">By status</p>
              <ul className="mt-2 space-y-1 text-sm">
                {data.statusDistribution.map((slice) => (
                  <li key={slice.label} className="flex justify-between gap-2">
                    <span>{slice.label}</span>
                    <span className="tabular-nums">{slice.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>

      <Sheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            router.push(href({ exception: undefined }));
          }
        }}
      >
        <SheetContent side={compact ? "bottom" : "right"} className={compact ? "max-h-[85vh] overflow-y-auto" : "overflow-y-auto sm:max-w-xl"}>
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.reference}</SheetTitle>
                <SheetDescription>{selected.title}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6 text-sm">
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                {pending ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Updating…
                  </p>
                ) : null}

                <section>
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Identity</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge tone={severityTone[selected.severity]}>{selected.severity}</StatusBadge>
                    <StatusBadge tone={statusTone[selected.status]}>{statusLabel(selected.status)}</StatusBadge>
                    <StatusBadge tone="info">{typeLabel(selected.type)}</StatusBadge>
                  </div>
                  <p className="mt-2 text-muted-foreground">{selected.description}</p>
                </section>

                <section>
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Ownership</p>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div><dt className="text-xs text-muted-foreground">Owner</dt><dd>{selected.ownerName ?? "UNASSIGNED"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Due</dt><dd>{formatDay(selected.dueDate)} · {dueStateLabel(selected.dueState)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Age</dt><dd>{selected.ageDays} days</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Created</dt><dd>{formatDay(selected.createdAt)}</dd></div>
                  </dl>
                </section>

                <section>
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Affected entity</p>
                  <dl className="mt-2 grid gap-2">
                    <div><dt className="text-xs text-muted-foreground">Entity</dt><dd>{selected.entity.entityLabel}</dd></div>
                    {selected.entity.batchNumber ? (
                      <div><dt className="text-xs text-muted-foreground">Batch quality</dt><dd>{selected.entity.batchQualityStatus?.replaceAll("_", " ").toLowerCase() ?? "—"}</dd></div>
                    ) : null}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.entity.batchId ? <Button asChild size="sm" variant="outline"><Link href={`/batches?batch=${selected.entity.batchId}`}>Open batch</Link></Button> : null}
                    {selected.entity.inventoryLotId ? <Button asChild size="sm" variant="outline"><Link href={`/traceability?lot=${selected.entity.inventoryLotId}`}>Trace lot</Link></Button> : null}
                    {selected.entity.batchId ? <Button asChild size="sm" variant="outline"><Link href={`/traceability?batch=${selected.entity.batchId}`}>Trace batch</Link></Button> : null}
                    {selected.entity.productionOrderId ? <Button asChild size="sm" variant="outline"><Link href={`/operations?order=${selected.entity.productionOrderId}`}>Production order</Link></Button> : null}
                  </div>
                </section>

                <section>
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Investigation</p>
                  <div className="mt-2 space-y-2 text-muted-foreground">
                    <p><span className="text-foreground">Notes:</span> {selected.investigationNotes ?? "—"}</p>
                    <p><span className="text-foreground">Findings:</span> {selected.findings ?? "—"}</p>
                    <p><span className="text-foreground">Resolution:</span> {selected.resolutionNotes ?? "—"}</p>
                  </div>
                </section>

                {selected.traceabilityImpact ? (
                  <section>
                    <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Traceability</p>
                    <p className="mt-2 font-medium">{selected.traceabilityImpact.title}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusBadge tone="info">{confidenceLabel(selected.traceabilityImpact.confidence)} confidence</StatusBadge>
                      <StatusBadge tone="material">{scopeLabel(selected.traceabilityImpact.scope)}</StatusBadge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{selected.traceabilityImpact.allocationNote}</p>
                  </section>
                ) : null}

                <section>
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Corrective actions</p>
                  <ul className="mt-2 space-y-2">
                    {selected.correctiveActions.map((action) => (
                      <li key={action.id} className="rounded-sm border border-border p-3">
                        <p>{action.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {action.ownerName ?? "UNASSIGNED"} · {action.status.replace("_", " ").toLowerCase()} · due {formatDay(action.dueDate)}
                        </p>
                        {action.status !== "COMPLETED" && data.capabilities.canManage ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 min-h-9"
                            onClick={() => mutate(`/api/quality/corrective-actions/${action.id}`, "PATCH", { status: "COMPLETED" })}
                          >
                            Mark completed
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Timeline</p>
                  <ul className="mt-2 space-y-2">
                    {selected.timeline.map((event) => (
                      <li key={event.id} className="border-l border-border pl-3">
                        <p className="font-medium">{event.label}</p>
                        <p className="text-xs text-muted-foreground">{formatDay(event.createdAt)}{event.actorName ? ` · ${event.actorName}` : ""}</p>
                        {event.detail ? <p className="text-xs text-muted-foreground">{event.detail}</p> : null}
                      </li>
                    ))}
                  </ul>
                </section>

                {selected.allowedTransitions.length > 0 && data.capabilities.canManage ? (
                  <section>
                    <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Status</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selected.allowedTransitions.map((status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant="outline"
                          className="min-h-11 sm:min-h-8"
                          onClick={() => mutate(`/api/quality/exceptions/${selected.id}/transition`, "POST", { status })}
                        >
                          Move to {statusLabel(status)}
                        </Button>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
