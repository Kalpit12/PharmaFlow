"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AttentionItem, AttentionList } from "@/components/ds/attention-item";
import type { AttentionSeverity } from "@/components/ds/attention-item";
import { EmptyState } from "@/components/ds/empty-state";
import { QualityExceptionInspectSheet } from "@/components/quality/QualityExceptionInspectSheet";
import { QualityLogExceptionDialog } from "@/components/quality/QualityLogExceptionDialog";
import { severityRank, severityTone, statusTone, VIEW_LABEL } from "@/components/quality/quality-display";
import { usePreferences } from "@/components/providers/preferences-provider";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCompactLayout } from "@/hooks/use-compact-layout";
import { dueStateLabel, statusLabel } from "@/lib/quality/service";
import type { QualityExceptionSeverity, QualityExceptionType, QualitySnapshot, QualityViewId } from "@/lib/quality/types";

const SIMPLE_VIEWS: QualityViewId[] = ["open", "critical", "overdue"];
const KPI_IDS = ["open", "critical", "overdue", "unassigned"] as const;

function attentionSeverity(severity: string): AttentionSeverity {
  if (severity === "CRITICAL" || severity === "HIGH") return severity as AttentionSeverity;
  return "WATCH";
}

export function QualityWorkspaceSimple({ data }: { data: QualitySnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const { setLayoutMode } = usePreferences();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("exception"));
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logTitle, setLogTitle] = useState("");
  const [logDescription, setLogDescription] = useState("");
  const [logType, setLogType] = useState<QualityExceptionType>("BATCH_ISSUE");
  const [logSeverity, setLogSeverity] = useState<QualityExceptionSeverity>("HIGH");
  const [logBatchId, setLogBatchId] = useState(data.batchOptions[0]?.id ?? "");

  useEffect(() => {
    const fromUrl = searchParams.get("exception");
    if (fromUrl) setSelectedId(fromUrl);
  }, [searchParams]);

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

  const kpis = KPI_IDS.map((id) => data.kpis.find((row) => row.id === id)).filter(Boolean) as QualitySnapshot["kpis"];

  const listRows = useMemo(() => {
    return [...data.exceptions]
      .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 15);
  }, [data.exceptions]);

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

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Quality views" className="flex flex-wrap gap-1">
          {SIMPLE_VIEWS.map((view) => (
            <Button key={view} asChild size="sm" variant={data.view === view ? "secondary" : "ghost"} className="min-h-11 sm:min-h-8">
              <Link href={href({ view: view === "all" ? undefined : view })}>{VIEW_LABEL[view]}</Link>
            </Button>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2">
          {data.capabilities.canManage ? (
            <Button type="button" size="sm" className="min-h-11 sm:min-h-8" onClick={() => setLogOpen(true)}>
              Log exception
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => setLayoutMode("advanced")}>
            Distribution & search
          </Button>
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

      <section aria-label="Quality KPIs" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="work-surface px-4 py-3">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="metric-value mt-1 text-xl">{kpi.value}</p>
          </div>
        ))}
      </section>

      <AttentionList
        title="Quality signals"
        subtitle={data.attention.length === 0 ? "No open exceptions need escalation in this view." : "Critical, overdue, or unassigned work."}
      >
        {data.attention.length === 0 ? (
          <AttentionItem domain="Quality" severity="INFO" issue="No quality exceptions flagged here." href="/quality?view=open" actionLabel="Open queue" />
        ) : (
          data.attention.slice(0, 6).map((item) => (
            <AttentionItem
              key={item.id}
              domain="Quality"
              severity={attentionSeverity(item.severity)}
              issue={item.title}
              evidence={item.detail}
              href={item.href}
              actionLabel="Open"
            />
          ))
        )}
      </AttentionList>

      {listRows.length === 0 ? (
        <EmptyState title="No quality exceptions to show" description={data.emptyReason ?? "Log an exception or switch to advanced layout to search."} />
      ) : (
        <section aria-label="Priority exceptions" className="work-surface">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Exceptions to work</p>
            <p className="text-xs text-muted-foreground">Sorted by severity — tap to update status or links.</p>
          </div>
          <ul className="divide-y divide-border">
            {listRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => {
                    setSelectedId(row.id);
                    router.push(href({ exception: row.id }));
                  }}
                >
                  <div className="min-w-0">
                    <p className="font-medium">{row.reference}</p>
                    <p className="text-xs text-muted-foreground">{row.title}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={severityTone[row.severity]}>{row.severity}</StatusBadge>
                    <StatusBadge tone={statusTone[row.status]}>{statusLabel(row.status)}</StatusBadge>
                    <span className="text-xs text-muted-foreground">{dueStateLabel(row.dueState)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
              compact
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
