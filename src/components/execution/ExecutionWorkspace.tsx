"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Loader2, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/ds/empty-state";
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
  EXECUTION_DOMAINS,
  EXECUTION_FILTERS,
  type ExecutionDomain,
  type ExecutionFilterId,
  type ExecutionItem,
  type ExecutionSnapshot,
} from "@/lib/execution/types";
import { filterExecutionItems, resolveExecutionFilters } from "@/lib/execution/filters";
import type { StatusTone } from "@/types/status";

const FILTER_LABEL: Record<ExecutionFilterId, string> = {
  all: "All",
  "needs-review": "Needs review",
  ready: "Ready",
  executed: "Executed",
  rejected: "Rejected",
  failed: "Failed",
};

const DOMAIN_LABEL: Record<ExecutionDomain | "all", string> = {
  all: "All domains",
  sales: "Sales",
  customers: "Customers",
  operations: "Operations",
  materials: "Materials",
  procurement: "Procurement",
  communications: "Communications",
};

const statusTone: Record<string, StatusTone> = {
  NEEDS_REVIEW: "material",
  READY: "info",
  EXECUTED: "intel",
  REJECTED: "neutral",
  FAILED: "danger",
  BLOCKED: "danger",
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

function rawId(item: ExecutionItem): string {
  return item.id.split(":").slice(1).join(":");
}

function FiltersForm({
  view,
  domain,
  onNavigate,
}: {
  view: ExecutionFilterId;
  domain: ExecutionDomain | "all";
  onNavigate: (patch: Record<string, string | undefined>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Status</p>
        <div className="flex flex-wrap gap-2">
          {EXECUTION_FILTERS.map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={view === id ? "default" : "outline"}
              className="min-h-9"
              onClick={() => onNavigate({ view: id === "all" ? undefined : id })}
            >
              {FILTER_LABEL[id]}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Domain</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={domain === "all" ? "default" : "outline"}
            className="min-h-9"
            onClick={() => onNavigate({ domain: undefined })}
          >
            All domains
          </Button>
          {EXECUTION_DOMAINS.map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={domain === id ? "default" : "outline"}
              className="min-h-9"
              onClick={() => onNavigate({ domain: id })}
            >
              {DOMAIN_LABEL[id]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({
  item,
  busy,
  error,
  onApprove,
  onReject,
}: {
  item: ExecutionItem;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusTone[item.priority] ?? "neutral"}>{item.priority}</StatusBadge>
        <StatusBadge tone={statusTone[item.status] ?? "neutral"}>{item.status.replaceAll("_", " ")}</StatusBadge>
        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{item.domain}</span>
      </div>

      <div>
        <h3 className="text-base font-semibold tracking-tight">{item.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.kind} · {item.createdByName} ·{" "}
          {new Date(item.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
        </p>
      </div>

      <section>
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Why</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.reason}</p>
        <p className="mt-2 text-xs text-muted-foreground">Source status: {item.sourceStatus.replaceAll("_", " ")}</p>
      </section>

      <section>
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">What Pharmaflow prepared</p>
        <p className="mt-1 text-sm leading-relaxed">{item.preparedSummary}</p>
        {item.steps && item.steps.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {item.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section>
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Impact</p>
        <p className="mt-1 text-sm text-muted-foreground">{item.impactSummary}</p>
      </section>

      <section className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
        <div className="flex gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Safety</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.safetyNote}</p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {item.canDecide && item.executable ? (
          <>
            <Button type="button" className="min-h-11 sm:min-h-8" disabled={busy} onClick={onApprove}>
              {busy ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
              {item.kind === "REQUISITION" ? "Mark reviewed" : item.sourceStatus === "FAILED" ? "Retry" : "Approve & execute"}
            </Button>
            {item.status === "NEEDS_REVIEW" ? (
              <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" disabled={busy} onClick={onReject}>
                Reject
              </Button>
            ) : null}
          </>
        ) : null}
        <Button asChild type="button" variant="outline" className="min-h-11 sm:min-h-8">
          <Link href={item.sourceHref}>Open source record</Link>
        </Button>
        <Button asChild type="button" variant="ghost" className="min-h-11 sm:min-h-8">
          <Link href="/ai?q=What%20needs%20my%20attention%20today%3F">Explain in AI</Link>
        </Button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function ExecutionWorkspace({ data }: { data: ExecutionSnapshot }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compact = useCompactLayout();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<ExecutionItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filters = resolveExecutionFilters({
    view: searchParams.get("view") ?? undefined,
    domain: searchParams.get("domain") ?? undefined,
  });

  const navigate = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setFiltersOpen(false);
  };

  const queue = useMemo(
    () => filterExecutionItems(data.queue, filters),
    [data.queue, filters]
  );
  const history = useMemo(
    () => filterExecutionItems(data.history, filters.view === "all" ? { view: "all", domain: filters.domain } : filters),
    [data.history, filters]
  );

  const decide = async (item: ExecutionItem, decision: "approve" | "reject") => {
    setBusy(true);
    setError(null);
    const id = rawId(item);
    try {
      let url = "";
      let body: Record<string, string> = {};
      if (item.kind === "ACTION") {
        url = `/api/actions/${id}`;
        body = { decision };
      } else if (item.kind === "WORKFLOW") {
        url = `/api/workflows/${id}`;
        body = { decision };
      } else if (item.kind === "REQUISITION") {
        url = `/api/procurement/requisitions/${id}`;
        body = { decision: decision === "approve" ? "review" : "reject" };
      } else {
        setError("Communication drafts are not executable from Execution. Open Communications to review.");
        return;
      }
      const result = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await result.json()) as { message?: string };
      if (!result.ok) {
        setError(payload.message ?? "Unable to update this item.");
        return;
      }
      setSelected(null);
      startTransition(() => router.refresh());
    } catch {
      setError("Unable to update this item.");
    } finally {
      setBusy(false);
    }
  };

  const filterControls = (
    <FiltersForm view={filters.view} domain={filters.domain} onNavigate={navigate} />
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="-mx-1 flex gap-0 overflow-x-auto border-y border-border px-1 [scrollbar-width:thin]">
        {[
          { label: "Needs review", value: data.kpis.needsReview },
          { label: "Approved / ready", value: data.kpis.ready },
          { label: "Executed today", value: data.kpis.executedToday },
          { label: "Blocked / failed", value: data.kpis.blockedOrFailed },
        ].map((kpi, index) => (
          <div key={kpi.label} className={cn("min-w-[140px] flex-1 px-4 py-3.5", index > 0 && "border-l border-border")}>
            <p className="label-context">{kpi.label}</p>
            <p className="metric-value mt-1 text-xl">{kpi.value}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{data.disclaimer}</p>
        <Button type="button" variant="outline" size="sm" className="min-h-11 lg:hidden" onClick={() => setFiltersOpen(true)}>
          <Filter data-icon="inline-start" />
          Filters
        </Button>
      </div>

      <div className="hidden lg:block">{filterControls}</div>

      <section className="min-w-0 work-surface">
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight">Priority queue</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {queue.length === 0 ? "No actions need your attention." : `${queue.length} item${queue.length === 1 ? "" : "s"} in queue`}
            {pending ? " · Refreshing…" : ""}
          </p>
        </div>
        {queue.length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent px-4 py-10"
            title="No actions need your attention."
            description="When Pharmaflow prepares an action, workflow, or requisition, it will appear here for review."
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {queue.map((item) => (
              <li key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={statusTone[item.priority] ?? "neutral"}>{item.priority}</StatusBadge>
                    <StatusBadge tone={statusTone[item.status] ?? "neutral"}>{item.status.replaceAll("_", " ")}</StatusBadge>
                    <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{item.domain}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium tracking-tight">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.targetLabel} · {item.recommendedAction}
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" className="min-h-11 shrink-0 sm:min-h-8" onClick={() => { setSelected(item); setError(null); }}>
                  Review
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-w-0 work-surface">
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight">Execution history</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Recently executed, rejected, or completed items.</p>
        </div>
        {history.length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent px-4 py-8"
            title="No approved actions are waiting to execute."
            description="Completed and rejected items from Actions, Workflows, and Procurement appear here."
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {history.slice(0, 20).map((item) => (
              <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={statusTone[item.status] ?? "neutral"}>{item.status.replaceAll("_", " ")}</StatusBadge>
                    <span className="text-[11px] text-muted-foreground uppercase">{item.kind}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.targetLabel}</p>
                </div>
                <Button type="button" size="sm" variant="ghost" className="min-h-9 shrink-0" onClick={() => { setSelected(item); setError(null); }}>
                  Details
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground">{data.planningNote}</p>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:max-w-none lg:hidden">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Status and domain filters for the execution queue.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 px-1 pb-6">{filterControls}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent
          side={compact ? "bottom" : "right"}
          className={compact ? "max-h-[90vh] overflow-y-auto sm:max-w-none" : "w-full overflow-y-auto sm:max-w-md"}
        >
          <SheetHeader>
            <SheetTitle>Review</SheetTitle>
            <SheetDescription>Signal → recommendation → approval → execution.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 px-1 pb-8">
            {selected ? (
              <ReviewPanel
                item={selected}
                busy={busy}
                error={error}
                onApprove={() => void decide(selected, "approve")}
                onReject={() => void decide(selected, "reject")}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
