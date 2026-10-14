"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

import { formatDay, severityTone, statusTone } from "@/components/quality/quality-display";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dueStateLabel, statusLabel, typeLabel } from "@/lib/quality/service";
import type { QualityExceptionRow } from "@/lib/quality/types";
import { confidenceLabel, scopeLabel } from "@/lib/traceability/impact";

export function QualityExceptionInspectSheet({
  selected,
  canManage,
  compact = false,
  error,
  pending,
  onMutate,
}: {
  selected: QualityExceptionRow;
  canManage: boolean;
  compact?: boolean;
  error: string | null;
  pending: boolean;
  onMutate: (url: string, method: string, body?: object) => Promise<boolean>;
}) {
  return (
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
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Summary</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge tone={severityTone[selected.severity]}>{selected.severity}</StatusBadge>
            <StatusBadge tone={statusTone[selected.status]}>{statusLabel(selected.status)}</StatusBadge>
            <StatusBadge tone="info">{typeLabel(selected.type)}</StatusBadge>
          </div>
          <p className="mt-2 text-muted-foreground">{compact ? selected.description.slice(0, 280) : selected.description}</p>
        </section>

        <section>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Ownership</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Owner</dt><dd>{selected.ownerName ?? "UNASSIGNED"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Due</dt><dd>{formatDay(selected.dueDate)} · {dueStateLabel(selected.dueState)}</dd></div>
            {!compact ? (
              <>
                <div><dt className="text-xs text-muted-foreground">Age</dt><dd>{selected.ageDays} days</dd></div>
                <div><dt className="text-xs text-muted-foreground">Created</dt><dd>{formatDay(selected.createdAt)}</dd></div>
              </>
            ) : null}
          </dl>
        </section>

        <section>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Affected entity</p>
          <dl className="mt-2 grid gap-2">
            <div><dt className="text-xs text-muted-foreground">Entity</dt><dd>{selected.entity.entityLabel}</dd></div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.entity.batchId ? <Button asChild size="sm" variant="outline"><Link href={`/batches?batch=${selected.entity.batchId}`}>Open batch</Link></Button> : null}
            {selected.entity.productionOrderId ? <Button asChild size="sm" variant="outline"><Link href={`/operations?order=${selected.entity.productionOrderId}`}>Production order</Link></Button> : null}
            {!compact && selected.entity.inventoryLotId ? <Button asChild size="sm" variant="outline"><Link href={`/traceability?lot=${selected.entity.inventoryLotId}`}>Trace lot</Link></Button> : null}
            {!compact && selected.entity.batchId ? <Button asChild size="sm" variant="outline"><Link href={`/traceability?batch=${selected.entity.batchId}`}>Trace batch</Link></Button> : null}
          </div>
        </section>

        {!compact ? (
          <>
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
                    {action.status !== "COMPLETED" && canManage ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 min-h-9"
                        onClick={() => onMutate(`/api/quality/corrective-actions/${action.id}`, "PATCH", { status: "COMPLETED" })}
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
          </>
        ) : null}

        {selected.allowedTransitions.length > 0 && canManage ? (
          <section>
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Status</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selected.allowedTransitions.map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant="outline"
                  className="min-h-11 sm:min-h-8"
                  onClick={() => onMutate(`/api/quality/exceptions/${selected.id}/transition`, "POST", { status })}
                >
                  Move to {statusLabel(status)}
                </Button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
