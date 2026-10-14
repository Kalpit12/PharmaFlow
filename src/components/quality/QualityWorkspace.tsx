"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/ds/empty-state";
import { ProcessTrail } from "@/components/ds/process-trail";
import { SearchInput } from "@/components/ds/search-input";
import { StatusBadge } from "@/components/ds/status-badge";
import { QualityExceptionInspectSheet } from "@/components/quality/QualityExceptionInspectSheet";
import { QualityLogExceptionDialog } from "@/components/quality/QualityLogExceptionDialog";
import { QualityWorkspaceSimple } from "@/components/quality/QualityWorkspaceSimple";
import { formatDay, severityRank, severityTone, statusTone, VIEW_LABEL } from "@/components/quality/quality-display";
import { useLayoutMode } from "@/components/providers/preferences-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import { dueStateLabel, statusLabel, typeLabel } from "@/lib/quality/service";
import {
  QUALITY_VIEWS,
  type QualityExceptionSeverity,
  type QualityExceptionType,
  type QualitySnapshot,
} from "@/lib/quality/types";

export function QualityWorkspace({ data }: { data: QualitySnapshot }) {
  const { simple } = useLayoutMode();
  if (simple) return <QualityWorkspaceSimple data={data} />;
  return <QualityWorkspaceFull data={data} />;
}

function QualityWorkspaceFull({ data }: { data: QualitySnapshot }) {
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
    return [...data.exceptions].sort(
      (a, b) => severityRank[b.severity] - severityRank[a.severity] || b.updatedAt.localeCompare(a.updatedAt)
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

      <QualityLogExceptionDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        data={data}
        pending={pending}
        title={logTitle}
        description={logDescription}
        type={logType}
        severity={logSeverity}
        batchId={logBatchId}
        onTitleChange={setLogTitle}
        onDescriptionChange={setLogDescription}
        onTypeChange={setLogType}
        onSeverityChange={setLogSeverity}
        onBatchIdChange={setLogBatchId}
        onSubmit={() => void submitException()}
      />

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
            <QualityExceptionInspectSheet
              selected={selected}
              canManage={data.capabilities.canManage}
              error={error}
              pending={pending}
              onMutate={mutate}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
