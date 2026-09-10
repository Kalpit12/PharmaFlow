"use client";

import { useState } from "react";

import { ACTION_REGISTRY, type ActionProposal } from "@/lib/ai/actions";
import { Button } from "@/components/ui/button";

export function AIActionProposalCard({
  proposal,
  onUpdated,
}: {
  proposal: ActionProposal;
  onUpdated?: (next: ActionProposal) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(proposal);
  const [error, setError] = useState<string | null>(null);
  const meta = ACTION_REGISTRY[current.type];

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(`/api/actions/${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await result.json()) as { action?: ActionProposal; message?: string };
      if (!result.ok || !payload.action) {
        setError(payload.message ?? "Unable to update the action.");
        return;
      }
      setCurrent(payload.action);
      onUpdated?.(payload.action);
      setOpen(false);
    } catch {
      setError("Unable to update the action.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">{current.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {meta.label} · {current.targetLabel}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{current.reason}</p>
      {current.status === "PENDING_APPROVAL" && !open ? (
        <Button type="button" size="sm" className="mt-3 min-h-11 sm:min-h-7" onClick={() => setOpen(true)}>
          Review
        </Button>
      ) : null}
      {open && current.status === "PENDING_APPROVAL" ? (
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Expected result. </span>
            {current.expectedResult}
          </p>
          <p>This does not send messages or change orders. A manager must approve it.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => void decide("approve")}>
              Approve & Execute
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {current.status === "EXECUTED" ? <p className="mt-2 text-xs text-success">Follow-up recorded.</p> : null}
      {current.status === "REJECTED" ? <p className="mt-2 text-xs text-muted-foreground">Action rejected.</p> : null}
      {current.status === "FAILED" ? <p className="mt-2 text-xs text-danger">Action failed.</p> : null}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
