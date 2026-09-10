"use client";

import Link from "next/link";
import { useState } from "react";

import { ACTION_REGISTRY, type ActionListItem, type ActionProposal } from "@/lib/ai/actions";
import { WORKFLOW_REGISTRY, type WorkflowListItem, type WorkflowProposal } from "@/lib/ai/workflows";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { PurchaseOrderApprovalItem } from "@/lib/purchase-orders/types";
import type { StatusTone } from "@/types/status";

type RequisitionListItem = {
  id: string;
  title: string;
  detail: string;
  reason: string;
  createdByName: string;
  createdAt: string;
  status: "DRAFT" | "REVIEWED" | "REJECTED";
};

const statusTone: Record<string, StatusTone> = {
  PENDING_APPROVAL: "material",
  EXECUTED: "intel",
  COMPLETED: "intel",
  REJECTED: "neutral",
  FAILED: "danger",
  APPROVED: "info",
  RUNNING: "info",
  CANCELLED: "neutral",
  PROPOSED: "info",
};

function ActionRow({
  item,
  onChange,
}: {
  item: ActionListItem;
  onChange: (id: string, next: ActionListItem) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(`/api/actions/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await result.json()) as { action?: ActionProposal; message?: string };
      if (!result.ok || !payload.action) {
        setError(payload.message ?? "Unable to update the action.");
        return;
      }
      onChange(item.id, { ...item, status: payload.action.status });
    } catch {
      setError("Unable to update the action.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="work-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{item.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ACTION_REGISTRY[item.type].label} · {item.targetLabel} · {item.createdByName}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            {new Date(item.proposedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
          </p>
        </div>
        <StatusBadge tone={statusTone[item.status] ?? "neutral"}>{item.status.replaceAll("_", " ")}</StatusBadge>
      </div>
      {item.status === "PENDING_APPROVAL" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => void decide("approve")}>
            Approve & Execute
          </Button>
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => void decide("reject")}>
            Reject
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </li>
  );
}

function WorkflowRow({
  item,
  onChange,
}: {
  item: WorkflowListItem;
  onChange: (id: string, next: WorkflowListItem) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = WORKFLOW_REGISTRY[item.type];

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(`/api/workflows/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await result.json()) as { workflow?: WorkflowProposal; message?: string };
      if (!result.ok || !payload.workflow) {
        setError(payload.message ?? "Unable to update the workflow.");
        return;
      }
      onChange(item.id, {
        ...item,
        status: payload.workflow.status,
        reviewerName: item.reviewerName,
      });
    } catch {
      setError("Unable to update the workflow.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="work-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{meta.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.targetLabel} · {item.createdByName}
            {item.reviewerName ? ` · ${item.reviewerName}` : ""}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {item.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            {new Date(item.proposedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
          </p>
        </div>
        <StatusBadge tone={statusTone[item.status] ?? "neutral"}>{item.status.replaceAll("_", " ")}</StatusBadge>
      </div>
      {item.status === "PENDING_APPROVAL" || item.status === "FAILED" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => void decide("approve")}>
            {item.status === "FAILED" ? "Retry" : "Approve & Run"}
          </Button>
          {item.status === "PENDING_APPROVAL" ? (
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => void decide("reject")}>
              Reject
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </li>
  );
}

function RequisitionRow({ item }: { item: RequisitionListItem }) {
  return (
    <li className="work-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Procurement Requisition · {item.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.detail} · {item.createdByName}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            {new Date(item.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
          </p>
        </div>
        <StatusBadge tone="warning">{item.status}</StatusBadge>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Planning recommendation only — no purchase order or supplier communication is created.
      </p>
      <Button asChild size="sm" variant="outline" className="mt-3 min-h-11 sm:min-h-7">
        <Link href={`/procurement?requisition=${item.id}`}>Review in procurement</Link>
      </Button>
    </li>
  );
}

function PurchaseOrderRow({
  item,
  onChange,
}: {
  item: PurchaseOrderApprovalItem;
  onChange: (id: string, status: PurchaseOrderApprovalItem["status"]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(`/api/purchase-orders/${item.id}/${decision}`, { method: "POST" });
      const payload = (await result.json()) as { purchaseOrder?: { status: PurchaseOrderApprovalItem["status"] }; message?: string };
      if (!result.ok || !payload.purchaseOrder) {
        setError(payload.message ?? "Unable to update purchase order.");
        return;
      }
      onChange(item.id, payload.purchaseOrder.status);
    } catch {
      setError("Unable to update purchase order.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="work-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{item.poNumber}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.supplierName} · {item.totalLabel} · {item.createdByName}
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            {new Date(item.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
          </p>
        </div>
        <StatusBadge tone={statusTone[item.status] ?? "neutral"}>{item.status.replaceAll("_", " ")}</StatusBadge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Approval records internal purchasing readiness only. No supplier communication is sent.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-7">
          <Link href={`/purchase-orders/${item.id}`}>Review</Link>
        </Button>
        <Button type="button" size="sm" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => void decide("approve")}>
          Approve
        </Button>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-7" disabled={busy} onClick={() => void decide("reject")}>
          Reject
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </li>
  );
}

export function ApprovalsBoard({
  pending,
  history,
  workflowsPending,
  workflowsHistory,
  requisitions = [],
  purchaseOrders = [],
}: {
  pending: ActionListItem[];
  history: ActionListItem[];
  workflowsPending: WorkflowListItem[];
  workflowsHistory: WorkflowListItem[];
  requisitions?: RequisitionListItem[];
  purchaseOrders?: PurchaseOrderApprovalItem[];
}) {
  const [pendingRows, setPendingRows] = useState(pending);
  const [historyRows, setHistoryRows] = useState(history);
  const [pendingWorkflows, setPendingWorkflows] = useState(workflowsPending);
  const [historyWorkflows, setHistoryWorkflows] = useState(workflowsHistory);
  const [pendingPurchaseOrders, setPendingPurchaseOrders] = useState(purchaseOrders);

  const moveAction = (id: string, next: ActionListItem) => {
    setPendingRows((rows) => rows.filter((row) => row.id !== id));
    setHistoryRows((rows) => [next, ...rows.filter((row) => row.id !== id)]);
  };

  const moveWorkflow = (id: string, next: WorkflowListItem) => {
    setPendingWorkflows((rows) => rows.filter((row) => row.id !== id));
    setHistoryWorkflows((rows) => [next, ...rows.filter((row) => row.id !== id)]);
  };

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Purchase orders</h2>
        <p className="mt-1 text-xs text-muted-foreground">Internal PO approval. Not routed through Phase 9 actions.</p>
        {pendingPurchaseOrders.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No purchase orders awaiting approval.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pendingPurchaseOrders.map((item) => (
              <PurchaseOrderRow
                key={item.id}
                item={item}
                onChange={(id) => setPendingPurchaseOrders((rows) => rows.filter((row) => row.id !== id))}
              />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Procurement requisitions</h2>
        <p className="mt-1 text-xs text-muted-foreground">Draft requisitions for human review. These are not executable purchase actions.</p>
        {requisitions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No procurement requisition drafts waiting for review.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {requisitions.map((item) => (
              <RequisitionRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Workflows</h2>
        {pendingWorkflows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No workflows waiting for approval.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pendingWorkflows.map((item) => (
              <WorkflowRow key={item.id} item={item} onChange={moveWorkflow} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Pending approvals</h2>
        {pendingRows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No actions waiting for approval.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pendingRows.map((item) => (
              <ActionRow key={item.id} item={item} onChange={moveAction} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Workflow history</h2>
        {historyWorkflows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No completed or rejected workflows yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {historyWorkflows.map((item) => (
              <WorkflowRow key={item.id} item={item} onChange={moveWorkflow} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Action history</h2>
        {historyRows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No executed or rejected actions yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {historyRows.map((item) => (
              <ActionRow key={item.id} item={item} onChange={moveAction} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
