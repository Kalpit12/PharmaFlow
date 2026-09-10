"use client";

import { useState } from "react";

import { WORKFLOW_REGISTRY, type WorkflowProposal } from "@/lib/ai/workflows";
import { Button } from "@/components/ui/button";

export function AIWorkflowProposalCard({
  proposal,
  onUpdated,
}: {
  proposal: WorkflowProposal;
  onUpdated?: (next: WorkflowProposal) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(proposal);
  const [error, setError] = useState<string | null>(null);
  const meta = WORKFLOW_REGISTRY[current.type];

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(`/api/workflows/${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await result.json()) as { workflow?: WorkflowProposal; message?: string };
      if (!result.ok || !payload.workflow) {
        setError(payload.message ?? "Unable to update the workflow.");
        return;
      }
      setCurrent(payload.workflow);
      onUpdated?.(payload.workflow);
      setOpen(false);
    } catch {
      setError("Unable to update the workflow.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Recommended workflow</p>
      <p className="mt-1 text-sm font-medium">{meta.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{current.targetLabel}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{current.reason}</p>
      {current.status === "PENDING_APPROVAL" && !open ? (
        <Button type="button" size="sm" className="mt-3 min-h-11 sm:min-h-7" onClick={() => setOpen(true)}>
          Review workflow
        </Button>
      ) : null}
      {open && current.status === "PENDING_APPROVAL" ? (
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Target. </span>
            {current.targetLabel}
          </p>
          <p className="font-medium text-foreground">This workflow will:</p>
          <ul className="list-disc space-y-1 pl-4">
            {current.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          <p>This does not send messages. A manager must approve it. No additional AI call is made.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => void decide("approve")}>
              Approve & Run
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => void decide("reject")}>
              Reject
            </Button>
          </div>
        </div>
      ) : null}
      {current.status === "COMPLETED" ? <p className="mt-2 text-xs text-success">Workflow completed.</p> : null}
      {current.status === "REJECTED" ? <p className="mt-2 text-xs text-muted-foreground">Workflow rejected.</p> : null}
      {current.status === "FAILED" ? <p className="mt-2 text-xs text-danger">Workflow failed.</p> : null}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
