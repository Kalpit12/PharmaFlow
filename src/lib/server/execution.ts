import { ACTION_REGISTRY } from "@/lib/ai/actions";
import { COMMUNICATION_REGISTRY } from "@/lib/ai/communications";
import { WORKFLOW_REGISTRY } from "@/lib/ai/workflows";
import type {
  ExecutionDomain,
  ExecutionItem,
  ExecutionPriority,
  ExecutionQueueStatus,
  ExecutionSnapshot,
} from "@/lib/execution/types";
import { canApprove, listActions } from "@/lib/server/actions";
import { listCommunications } from "@/lib/server/communications";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { listPendingRequisitions } from "@/lib/server/procurement";
import { listPendingPurchaseOrders } from "@/lib/server/purchase-orders";
import { getTenant } from "@/lib/server/services/tenant";
import { listWorkflows } from "@/lib/server/workflows";

const PRIORITY_RANK: Record<ExecutionPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function domainForAction(type: string): ExecutionDomain {
  if (type === "CREATE_SALES_OPPORTUNITY") return "sales";
  return "customers";
}

function domainForWorkflow(type: string): ExecutionDomain {
  if (type === "RFQ_FOLLOW_UP" || type === "SALES_OPPORTUNITY_FOLLOW_UP") return "sales";
  return "customers";
}

function mapActionStatus(status: string): ExecutionQueueStatus {
  if (status === "PENDING_APPROVAL" || status === "PROPOSED") return "NEEDS_REVIEW";
  if (status === "APPROVED") return "READY";
  if (status === "EXECUTED") return "EXECUTED";
  if (status === "REJECTED" || status === "CANCELLED") return "REJECTED";
  if (status === "FAILED") return "FAILED";
  return "BLOCKED";
}

function mapWorkflowStatus(status: string): ExecutionQueueStatus {
  if (status === "PENDING_APPROVAL" || status === "PROPOSED") return "NEEDS_REVIEW";
  if (status === "FAILED") return "READY";
  if (status === "RUNNING") return "READY";
  if (status === "COMPLETED") return "EXECUTED";
  if (status === "REJECTED" || status === "CANCELLED") return "REJECTED";
  return "BLOCKED";
}

function mapRequisitionStatus(status: string): ExecutionQueueStatus {
  if (status === "DRAFT") return "NEEDS_REVIEW";
  if (status === "REVIEWED") return "EXECUTED";
  if (status === "REJECTED") return "REJECTED";
  return "BLOCKED";
}

function mapCommunicationStatus(status: string): ExecutionQueueStatus {
  if (status === "DRAFT") return "NEEDS_REVIEW";
  if (status === "REVIEWED") return "READY";
  if (status === "APPROVED") return "EXECUTED";
  if (status === "ARCHIVED") return "EXECUTED";
  return "BLOCKED";
}

async function listRecentRequisitions(ctx: TenantContext) {
  const rows = await getPrisma().procurementRequisition.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["REVIEWED", "REJECTED"] } },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map((row) => ({
    id: row.id,
    title: `${row.materialName} (${row.materialSku})`,
    detail: `${row.quantity.toLocaleString("en-KE")} ${row.materialUnit} · ${row.risk} risk`,
    reason: row.reason,
    createdByName: row.createdBy.name,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
  }));
}

export async function getExecutionSnapshot(ctx: TenantContext): Promise<ExecutionSnapshot> {
  const tenant = await getTenant(ctx);
  const approve = canApprove(ctx.role);
  const [actions, workflows, pendingRequisitions, recentRequisitions, communications, pendingPurchaseOrders] = await Promise.all([
    listActions(ctx),
    listWorkflows(ctx),
    listPendingRequisitions(ctx),
    listRecentRequisitions(ctx),
    listCommunications(ctx),
    listPendingPurchaseOrders(ctx),
  ]);

  const items: ExecutionItem[] = [];

  for (const row of [...actions.pending, ...actions.history]) {
    const queueStatus = mapActionStatus(row.status);
    const meta = ACTION_REGISTRY[row.type];
    items.push({
      id: `action:${row.id}`,
      kind: "ACTION",
      domain: domainForAction(row.type),
      priority: queueStatus === "NEEDS_REVIEW" ? "HIGH" : queueStatus === "FAILED" ? "HIGH" : "MEDIUM",
      title: row.title,
      reason: row.reason,
      recommendedAction: meta.label,
      status: queueStatus,
      sourceStatus: row.status,
      targetLabel: row.targetLabel,
      createdAt: row.proposedAt,
      createdByName: row.createdByName,
      sourceHref: "/approvals",
      executable: queueStatus === "NEEDS_REVIEW",
      canDecide: approve && queueStatus === "NEEDS_REVIEW",
      safetyNote: "Nothing runs until an authorized manager approves. Execution uses the existing Phase 9 action path. Rejected or executed actions cannot run again.",
      preparedSummary: `${meta.label} for ${row.targetLabel}. Expected: ${meta.expectedResult}`,
      impactSummary: `Customer: ${row.targetLabel}`,
    });
  }

  for (const row of [...workflows.pending, ...workflows.history]) {
    const queueStatus = mapWorkflowStatus(row.status);
    const meta = WORKFLOW_REGISTRY[row.type];
    items.push({
      id: `workflow:${row.id}`,
      kind: "WORKFLOW",
      domain: domainForWorkflow(row.type),
      priority: queueStatus === "NEEDS_REVIEW" || queueStatus === "READY" ? "HIGH" : "MEDIUM",
      title: row.title || meta.title,
      reason: row.reason,
      recommendedAction: meta.title,
      status: queueStatus,
      sourceStatus: row.status,
      targetLabel: row.targetLabel,
      createdAt: row.proposedAt,
      createdByName: row.createdByName,
      sourceHref: "/approvals",
      executable: queueStatus === "NEEDS_REVIEW" || (queueStatus === "READY" && row.status === "FAILED"),
      canDecide: approve && (queueStatus === "NEEDS_REVIEW" || row.status === "FAILED"),
      safetyNote: "Workflow steps run only after approval via the existing Phase 10 engine. Completed workflows cannot run again.",
      preparedSummary: `Workflow steps: ${row.steps.join(" → ")}`,
      impactSummary: `Customer: ${row.targetLabel}`,
      steps: row.steps,
    });
  }

  for (const row of pendingRequisitions) {
    items.push({
      id: `requisition:${row.id}`,
      kind: "REQUISITION",
      domain: "procurement",
      priority: "HIGH",
      title: `Procurement requisition · ${row.title}`,
      reason: row.reason,
      recommendedAction: "Mark reviewed or reject",
      status: "NEEDS_REVIEW",
      sourceStatus: row.status,
      targetLabel: row.title,
      createdAt: row.createdAt,
      createdByName: row.createdByName,
      sourceHref: `/procurement?requisition=${row.id}`,
      executable: true,
      canDecide: approve,
      safetyNote:
        "Planning recommendation only. Review does not create a purchase order, select a supplier, or send communications.",
      preparedSummary: row.detail,
      impactSummary: `Material: ${row.title}`,
    });
  }

  for (const row of recentRequisitions) {
    items.push({
      id: `requisition:${row.id}`,
      kind: "REQUISITION",
      domain: "procurement",
      priority: "MEDIUM",
      title: `Procurement requisition · ${row.title}`,
      reason: row.reason,
      recommendedAction: "Open procurement record",
      status: mapRequisitionStatus(row.status),
      sourceStatus: row.status,
      targetLabel: row.title,
      createdAt: row.reviewedAt ?? row.rejectedAt ?? row.createdAt,
      createdByName: row.createdByName,
      sourceHref: `/procurement?requisition=${row.id}`,
      executable: false,
      canDecide: false,
      safetyNote: "This requisition is closed for review. No purchase execution is available.",
      preparedSummary: row.detail,
      impactSummary: `Material: ${row.title}`,
    });
  }

  for (const row of pendingPurchaseOrders) {
    items.push({
      id: `purchase-order:${row.id}`,
      kind: "PURCHASE_ORDER",
      domain: "procurement",
      priority: "HIGH",
      title: `Purchase order · ${row.poNumber}`,
      reason: `${row.supplierName} · ${row.totalLabel}`,
      recommendedAction: "Approve or reject purchase order",
      status: "NEEDS_REVIEW",
      sourceStatus: row.status,
      targetLabel: row.supplierName,
      createdAt: row.createdAt,
      createdByName: row.createdByName,
      sourceHref: `/purchase-orders/${row.id}`,
      executable: true,
      canDecide: approve,
      safetyNote: "Approval records an internal purchasing decision only. No supplier communication occurs.",
      preparedSummary: `${row.poNumber} · ${row.totalLabel}`,
      impactSummary: `Supplier: ${row.supplierName}`,
    });
  }

  const receivablePos = await getPrisma().purchaseOrder.findMany({
    where: { tenantId: ctx.tenantId, status: "APPROVED" },
    include: { supplier: true, items: { select: { quantity: true, receivedQuantity: true } } },
    orderBy: { updatedAt: "desc" },
    take: 15,
  });
  for (const row of receivablePos) {
    const remaining = row.items.reduce((sum, item) => sum + Math.max(item.quantity - item.receivedQuantity, 0), 0);
    if (remaining <= 0) continue;
    const received = row.items.reduce((sum, item) => sum + item.receivedQuantity, 0);
    items.push({
      id: `purchase-order-receive:${row.id}`,
      kind: "PURCHASE_ORDER",
      domain: "procurement",
      priority: received > 0 ? "MEDIUM" : "HIGH",
      title: `Receive goods · ${row.poNumber}`,
      reason: `${row.supplier.name} · ${remaining.toLocaleString("en-KE")} units remaining`,
      recommendedAction: "Receive into inventory",
      status: received > 0 ? "READY" : "NEEDS_REVIEW",
      sourceStatus: row.status,
      targetLabel: row.supplier.name,
      createdAt: row.updatedAt.toISOString(),
      createdByName: "—",
      sourceHref: `/receiving/${row.id}`,
      executable: true,
      canDecide: false,
      safetyNote: "Receiving updates inventory. This is not supplier communication or payment.",
      preparedSummary: `${row.poNumber} · ${received} received · ${remaining} remaining`,
      impactSummary: `Supplier: ${row.supplier.name}`,
    });
  }

  const awardedRfqs = await getPrisma().procurementRfq.findMany({
    where: { tenantId: ctx.tenantId, status: "AWARDED" },
    include: { items: { include: { product: true } }, createdBy: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  const approvedPos = await getPrisma().purchaseOrder.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["APPROVED", "REJECTED", "CLOSED"] } },
    include: { supplier: true, createdBy: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  for (const row of approvedPos) {
    items.push({
      id: `purchase-order-history:${row.id}`,
      kind: "PURCHASE_ORDER",
      domain: "procurement",
      priority: "LOW",
      title: `Purchase order · ${row.poNumber}`,
      reason: row.status === "CLOSED" ? "Fully received" : row.status === "APPROVED" ? "Approved for purchasing" : "Rejected",
      recommendedAction: row.status === "CLOSED" ? "View closed PO" : "View purchase order",
      status: row.status === "REJECTED" ? "REJECTED" : "EXECUTED",
      sourceStatus: row.status,
      targetLabel: row.supplier.name,
      createdAt: row.reviewedAt?.toISOString() ?? row.updatedAt.toISOString(),
      createdByName: row.createdBy.name,
      sourceHref: `/purchase-orders/${row.id}`,
      executable: false,
      canDecide: false,
      safetyNote: row.status === "CLOSED" ? "Goods received into inventory via Receiving." : "No supplier communication was triggered.",
      preparedSummary: row.poNumber,
      impactSummary: `Supplier: ${row.supplier.name}`,
    });
  }
  for (const row of awardedRfqs) {
    items.push({
      id: `procurement-rfq:${row.id}`,
      kind: "REQUISITION",
      domain: "procurement",
      priority: "LOW",
      title: `RFQ decision · ${row.reference}`,
      reason: row.title,
      recommendedAction: "Review awarded RFQ",
      status: "EXECUTED",
      sourceStatus: row.status,
      targetLabel: row.items.map((item) => item.product.name).join(", ") || row.title,
      createdAt: row.updatedAt.toISOString(),
      createdByName: row.createdBy.name,
      sourceHref: `/rfqs/${row.id}`,
      executable: false,
      canDecide: false,
      safetyNote: "Internal procurement decision only. No purchase order, supplier message, or inventory change was created.",
      preparedSummary: row.notes ?? "Award recorded for internal review.",
      impactSummary: `RFQ: ${row.reference}`,
    });
  }

  for (const row of [...communications.needsReview, ...communications.recent]) {
    const queueStatus = mapCommunicationStatus(row.status);
    const label = COMMUNICATION_REGISTRY[row.type]?.label ?? "Communication draft";
    items.push({
      id: `communication:${row.id}`,
      kind: "COMMUNICATION",
      domain: "communications",
      priority: queueStatus === "NEEDS_REVIEW" ? "MEDIUM" : "LOW",
      title: `${label} · ${row.customerName}`,
      reason: row.reason,
      recommendedAction: "Review draft in Communications",
      status: queueStatus,
      sourceStatus: row.status,
      targetLabel: row.customerName,
      createdAt: row.createdAt,
      createdByName: "Workspace",
      sourceHref: `/communications`,
      executable: false,
      canDecide: false,
      safetyNote:
        "Communication drafts never become automatic sends from Execution. Review and approve drafts in Communications only.",
      preparedSummary: `${row.subject} — ${row.preview}`,
      impactSummary: `Customer: ${row.customerName}`,
    });
  }

  items.sort(
    (a, b) =>
      PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
      (a.status === "NEEDS_REVIEW" ? 0 : 1) - (b.status === "NEEDS_REVIEW" ? 0 : 1) ||
      b.createdAt.localeCompare(a.createdAt)
  );

  const dayStart = startOfUtcDay().toISOString();
  const kpis = {
    needsReview: items.filter((item) => item.status === "NEEDS_REVIEW").length,
    ready: items.filter((item) => item.status === "READY" && item.executable).length,
    executedToday: items.filter((item) => item.status === "EXECUTED" && item.createdAt >= dayStart).length,
    blockedOrFailed: items.filter((item) => item.status === "FAILED" || item.status === "BLOCKED").length,
  };

  const queue = items.filter(
    (item) =>
      item.status === "NEEDS_REVIEW" ||
      (item.status === "READY" && item.executable) ||
      (item.status === "FAILED" && item.executable)
  );
  const history = items.filter(
    (item) =>
      item.status === "EXECUTED" ||
      item.status === "REJECTED" ||
      (item.status === "FAILED" && !item.executable) ||
      (item.status === "READY" && !item.executable)
  );

  return {
    brand: tenant.name,
    disclaimer: tenant.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: new Date().toISOString(),
    canApprove: approve,
    kpis,
    queue,
    history,
    emptyReason: queue.length === 0 ? "No actions need your attention." : null,
    planningNote:
      "Execution Control Center aggregates existing Action, Workflow, Procurement, and Communication records. Approval and execution reuse Phase 9/10 server paths. No model calls on this page.",
  };
}
