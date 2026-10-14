"use client";

import Link from "next/link";
import { Loader2, ShieldAlert } from "lucide-react";

import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { ExecutionItem } from "@/lib/execution/types";
import type { StatusTone } from "@/types/status";

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

export function ExecutionReviewPanel({
  item,
  busy,
  error,
  compact = false,
  onApprove,
  onReject,
}: {
  item: ExecutionItem;
  busy: boolean;
  error: string | null;
  compact?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusTone[item.priority] ?? "neutral"}>{item.priority}</StatusBadge>
        <StatusBadge tone={statusTone[item.status] ?? "neutral"}>{item.status.replaceAll("_", " ")}</StatusBadge>
        {!compact ? <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{item.domain}</span> : null}
      </div>

      <div>
        <h3 className="text-base font-semibold tracking-tight">{item.title}</h3>
        {!compact ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {item.kind} · {item.createdByName} ·{" "}
            {new Date(item.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
          </p>
        ) : null}
      </div>

      <section>
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{compact ? "Summary" : "Why"}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.reason}</p>
        {!compact ? (
          <p className="mt-2 text-xs text-muted-foreground">Source status: {item.sourceStatus.replaceAll("_", " ")}</p>
        ) : null}
      </section>

      {!compact ? (
        <>
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
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{item.preparedSummary}</p>
      )}

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
          <Link href={item.sourceHref}>Open source</Link>
        </Button>
        {!compact ? (
          <Button asChild type="button" variant="ghost" className="min-h-11 sm:min-h-8">
            <Link href="/ai?q=What%20needs%20my%20attention%20today%3F">Explain in AI</Link>
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
