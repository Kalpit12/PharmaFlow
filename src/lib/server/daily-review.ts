import type {
  CompactDailyReviewContext,
  DailyAttentionItem,
  DailyReviewSnapshot,
  DailySeverity,
  DomainHealth,
  DomainHealthStatus,
} from "@/lib/daily-review/types";
import { getDashboardData } from "@/lib/server/dashboard";
import type { TenantContext } from "@/lib/server/errors";
import { getInventorySnapshot, resolveInventoryFilters } from "@/lib/server/inventory";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { getOperationsPlanner, resolvePlanningWindow } from "@/lib/server/operations";
import { getProcurementSnapshot, resolveProcurementFilters } from "@/lib/server/procurement";
import { countProcurementRfqsAwaitingEvaluation } from "@/lib/server/procurement-rfqs";
import { countAwaitingReceipt } from "@/lib/server/receiving";
import { countPendingPurchaseOrders } from "@/lib/server/purchase-orders";
import { countSupplierPerformanceAttention } from "@/lib/server/supplier-performance";
import { getSupplierDataGapCount, getSupplierSnapshot, resolveSupplierFilters } from "@/lib/server/suppliers";
import { getTenant } from "@/lib/server/services/tenant";
import { getIntelligenceSnapshot } from "@/lib/server/intelligence";

const SEVERITY_RANK: Record<DailySeverity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function healthStatus(rank: number, limited = false): DomainHealthStatus {
  if (limited) return "LIMITED_DATA";
  if (rank >= 5) return "CRITICAL";
  if (rank >= 3) return "ATTENTION";
  return "HEALTHY";
}

export async function getDailyReviewSnapshot(ctx: TenantContext): Promise<DailyReviewSnapshot> {
  const tenant = await getTenant(ctx);
  const [dashboard, operations, materials, procurement, inventory, suppliers, supplierGaps, rfqsAwaitingEvaluation, pendingPurchaseOrders, awaitingReceipt, supplierPerfAttention, intelligence] =
    await Promise.all([
    getDashboardData(ctx).catch(() => null),
    getOperationsPlanner(ctx, resolvePlanningWindow({ weeks: "1" })).catch(() => null),
    getMaterialsSnapshot(ctx, resolveMaterialsFilters({ view: "shortages" })).catch(() => null),
    getProcurementSnapshot(ctx, resolveProcurementFilters({ view: "needs-review" })).catch(() => null),
    getInventorySnapshot(ctx, resolveInventoryFilters({ view: "overview" })).catch(() => null),
    getSupplierSnapshot(ctx, resolveSupplierFilters({ view: "all" })).catch(() => null),
    getSupplierDataGapCount(ctx).catch(() => 0),
    countProcurementRfqsAwaitingEvaluation(ctx).catch(() => 0),
    countPendingPurchaseOrders(ctx).catch(() => 0),
    countAwaitingReceipt(ctx).catch(() => 0),
    countSupplierPerformanceAttention(ctx).catch(() => 0),
    getIntelligenceSnapshot(ctx),
  ]);

  const attention: DailyAttentionItem[] = [];

  const atRiskOrders = operations?.orders.filter((order) => order.displayStatus === "AT_RISK") ?? [];
  const criticalUnscheduled =
    operations?.orders.filter((order) => order.displayStatus === "UNSCHEDULED" && (order.priority === "CRITICAL" || order.priority === "HIGH")) ??
    [];
  const conflicts = operations?.conflicts ?? [];

  if (atRiskOrders.length > 0) {
    const earliest = [...atRiskOrders].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    attention.push({
      id: "prod-at-risk",
      domain: "production",
      severity: "CRITICAL",
      title: "Production orders at risk",
      summary: `${atRiskOrders.length} production order${atRiskOrders.length === 1 ? "" : "s"} currently at risk.`,
      reason: earliest ? `Earliest due ${formatDay(earliest.dueDate)} · ${earliest.orderNumber}` : "Schedule conflict or due-date pressure.",
      targetType: "production",
      targetId: earliest?.id ?? null,
      href: "/operations",
      actionLabel: "Open production plan",
    });
  }
  if (conflicts.length > 0) {
    attention.push({
      id: "prod-conflicts",
      domain: "production",
      severity: "HIGH",
      title: "Scheduling conflicts",
      summary: `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} in the current planner window.`,
      reason: "Overlapping workstation capacity requires review.",
      targetType: "production",
      targetId: null,
      href: "/operations",
      actionLabel: "Open production plan",
    });
  }
  if (criticalUnscheduled.length > 0 && atRiskOrders.length === 0) {
    attention.push({
      id: "prod-unscheduled",
      domain: "production",
      severity: "MEDIUM",
      title: "High-priority unscheduled orders",
      summary: `${criticalUnscheduled.length} high/critical order${criticalUnscheduled.length === 1 ? "" : "s"} remain unscheduled.`,
      reason: "Capacity planning attention required.",
      targetType: "production",
      targetId: criticalUnscheduled[0]?.id ?? null,
      href: "/operations",
      actionLabel: "Open production plan",
    });
  }

  const criticalMaterials = materials?.materials.filter((row) => row.risk === "CRITICAL") ?? [];
  const highMaterials = materials?.materials.filter((row) => row.risk === "HIGH") ?? [];
  if (criticalMaterials.length > 0) {
    const top = criticalMaterials[0];
    attention.push({
      id: "mat-critical",
      domain: "materials",
      severity: "CRITICAL",
      title: `${top.name} material risk`,
      summary: `${criticalMaterials.length} critical material shortage${criticalMaterials.length === 1 ? "" : "s"} after stock and inbound.`,
      reason: `Affects ${top.affectedOrders.length} production order${top.affectedOrders.length === 1 ? "" : "s"}. Earliest due ${formatDay(top.earliestDueDate)}.`,
      targetType: "material",
      targetId: top.productId,
      href: `/materials?material=${top.productId}`,
      actionLabel: "View material",
    });
  } else if (highMaterials.length > 0) {
    const top = highMaterials[0];
    attention.push({
      id: "mat-high",
      domain: "materials",
      severity: "HIGH",
      title: "Material shortages",
      summary: `${highMaterials.length} material${highMaterials.length === 1 ? "" : "s"} projected below zero after inbound.`,
      reason: `${top.name} · net requirement ${top.netRequirement.toLocaleString("en-KE")}`,
      targetType: "material",
      targetId: top.productId,
      href: "/materials?view=shortages",
      actionLabel: "View material",
    });
  }

  const pendingRequisitions = procurement?.pendingReviewCount ?? 0;
  const criticalProcurement = procurement?.rows.filter((row) => row.risk === "CRITICAL") ?? [];
  if (pendingRequisitions > 0) {
    const draft = procurement?.rows.find((row) => row.rowStatus === "DRAFT" || row.rowStatus === "RECOMMENDATION");
    attention.push({
      id: "proc-pending",
      domain: "procurement",
      severity: criticalProcurement.length > 0 ? "HIGH" : "MEDIUM",
      title: "Procurement requisition awaiting review",
      summary: `${pendingRequisitions} requisition${pendingRequisitions === 1 ? "" : "s"} require review.`,
      reason: draft ? `${draft.name} · suggested qty ${draft.suggestedQuantity.toLocaleString("en-KE")}` : "Planning recommendations only — no purchase execution.",
      targetType: "procurement",
      targetId: draft?.productId ?? null,
      href: draft ? `/procurement?material=${draft.productId}` : "/procurement?view=needs-review",
      actionLabel: "Review requisition",
    });
  }

  if (rfqsAwaitingEvaluation > 0) {
    attention.push({
      id: "proc-rfq-eval",
      domain: "procurement",
      severity: "MEDIUM",
      title: "Procurement decisions",
      summary: `${rfqsAwaitingEvaluation} RFQ${rfqsAwaitingEvaluation === 1 ? "" : "s"} awaiting evaluation.`,
      reason: "Internal supplier comparison — no purchase order or supplier message is created.",
      targetType: "procurement",
      targetId: null,
      href: "/rfqs?status=evaluation",
      actionLabel: "Review RFQs",
    });
  }

  if (pendingPurchaseOrders > 0) {
    attention.push({
      id: "proc-po-pending",
      domain: "procurement",
      severity: "HIGH",
      title: "Purchase orders awaiting approval",
      summary: `${pendingPurchaseOrders} purchase order${pendingPurchaseOrders === 1 ? "" : "s"} need manager approval.`,
      reason: "Internal approval only — no supplier communication or inventory receipt.",
      targetType: "procurement",
      targetId: null,
      href: "/purchase-orders?view=pending",
      actionLabel: "Review purchase orders",
    });
  }

  if (awaitingReceipt > 0) {
    attention.push({
      id: "proc-receiving",
      domain: "procurement",
      severity: "MEDIUM",
      title: "Goods awaiting receipt",
      summary: `${awaitingReceipt} approved purchase order${awaitingReceipt === 1 ? "" : "s"} can be received into inventory.`,
      reason: "Receiving updates stock. No supplier communication occurs.",
      targetType: "procurement",
      targetId: null,
      href: "/receiving?view=awaiting",
      actionLabel: "Open receiving",
    });
  }

  if (supplierPerfAttention > 0) {
    attention.push({
      id: "proc-supplier-perf",
      domain: "procurement",
      severity: "MEDIUM",
      title: "Supplier receiving risk",
      summary: `${supplierPerfAttention} supplier${supplierPerfAttention === 1 ? "" : "s"} show Watch/Risk performance bands.`,
      reason: "Deterministic indicators from RFQ, PO, and receiving history — investigate evidence before acting.",
      targetType: "procurement",
      targetId: null,
      href: "/supplier-performance?view=attention",
      actionLabel: "Review supplier performance",
    });
  }

  const expiredQty = inventory?.expiredQty ?? 0;
  const lowStockCount = Number(String(inventory?.kpis.find((kpi) => kpi.id === "low")?.value ?? "0").replace(/,/g, "")) || 0;
  if (expiredQty > 0) {
    attention.push({
      id: "inv-expired",
      domain: "inventory",
      severity: "HIGH",
      title: "Expired inventory",
      summary: `${inventory?.expiredBatches ?? 0} batch${(inventory?.expiredBatches ?? 0) === 1 ? "" : "es"} currently expired.`,
      reason: "Expiry exposure requires disposition review.",
      targetType: "inventory",
      targetId: null,
      href: "/inventory?view=expiry&bucket=expired",
      actionLabel: "Open inventory",
    });
  } else if (lowStockCount > 0) {
    attention.push({
      id: "inv-low",
      domain: "inventory",
      severity: "MEDIUM",
      title: "Low stock",
      summary: `${lowStockCount} item${lowStockCount === 1 ? "" : "s"} at or below safety stock.`,
      reason: "Inventory health attention.",
      targetType: "inventory",
      targetId: null,
      href: "/inventory?view=health",
      actionLabel: "Open inventory",
    });
  }

  if (supplierGaps > 0) {
    attention.push({
      id: "sup-gaps",
      domain: "suppliers",
      severity: "MEDIUM",
      title: "Supplier data gaps",
      summary: `${supplierGaps} material${supplierGaps === 1 ? "" : "s"} have no supplier intelligence.`,
      reason: suppliers?.rows.length
        ? "Supplier comparison is limited for uncovered materials."
        : "Historical supplier performance unavailable for many materials.",
      targetType: "supplier",
      targetId: null,
      href: "/suppliers?view=gaps",
      actionLabel: "Compare suppliers",
    });
  }

  const salesAttention = (dashboard?.attention ?? []).filter(
    (item) => item.id.startsWith("rfq-") || item.meta?.toLowerCase().includes("rfq") || item.title.toLowerCase().includes("rfq")
  );
  for (const item of salesAttention.slice(0, 2)) {
    attention.push({
      id: `sales-${item.id}`,
      domain: "sales",
      severity: item.severity === "High" ? "HIGH" : "MEDIUM",
      title: item.title,
      summary: item.detail,
      reason: "Commercial follow-up from current workspace activity.",
      targetType: "sales",
      targetId: item.id,
      href: item.href || "/dashboard",
      actionLabel: item.actionLabel || "Review",
    });
  }

  const customerAttention = (dashboard?.attention ?? []).filter(
    (item) =>
      item.id.includes("inactive") ||
      item.meta?.toLowerCase().includes("customer") ||
      item.title.toLowerCase().includes("customer") ||
      item.title.toLowerCase().includes("follow")
  );
  for (const item of customerAttention.slice(0, 2)) {
    if (attention.some((row) => row.id === `sales-${item.id}` || row.id === `cust-${item.id}`)) continue;
    attention.push({
      id: `cust-${item.id}`,
      domain: "customers",
      severity: item.severity === "High" ? "HIGH" : "MEDIUM",
      title: item.title,
      summary: item.detail,
      reason: "Customer follow-up signal from current workspace data.",
      targetType: "customer",
      targetId: item.id,
      href: item.href || "/customers",
      actionLabel: item.actionLabel || "Review customer",
    });
  }

  attention.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.title.localeCompare(b.title));
  const topAttention = attention.slice(0, 12);

  const productionRank = atRiskOrders.length > 0 ? 5 : conflicts.length > 0 ? 4 : criticalUnscheduled.length > 0 ? 3 : 0;
  const materialsRank = criticalMaterials.length > 0 ? 5 : highMaterials.length > 0 ? 4 : 0;
  const procurementRank = criticalProcurement.length > 0 ? 4 : pendingRequisitions > 0 ? 3 : 0;
  const inventoryRank = expiredQty > 0 ? 4 : lowStockCount > 0 ? 3 : 0;
  const suppliersLimited = (suppliers?.rows.length ?? 0) === 0 || supplierGaps > 0;
  const salesRank = salesAttention.length > 0 ? 3 : 0;
  const customersRank = customerAttention.length > 0 ? 3 : 0;

  const health: DomainHealth[] = [
    {
      id: "production",
      label: "Production",
      status: healthStatus(productionRank),
      hint: operations ? `${atRiskOrders.length} at risk` : "Unavailable",
    },
    {
      id: "materials",
      label: "Materials",
      status: healthStatus(materialsRank),
      hint: materials ? `${criticalMaterials.length + highMaterials.length} shortages` : "Unavailable",
    },
    {
      id: "procurement",
      label: "Procurement",
      status: healthStatus(procurementRank),
      hint: procurement ? `${pendingRequisitions} pending review` : "Unavailable",
    },
    {
      id: "inventory",
      label: "Inventory",
      status: healthStatus(inventoryRank),
      hint: inventory ? (expiredQty > 0 ? "Expiry exposure" : "On hand") : "Unavailable",
    },
    {
      id: "suppliers",
      label: "Suppliers",
      status: healthStatus(supplierGaps > 0 ? 3 : 0, suppliersLimited && (suppliers?.rows.length ?? 0) === 0),
      hint: suppliersLimited ? `${supplierGaps} data gaps` : "Coverage available",
    },
    {
      id: "sales",
      label: "Sales",
      status: healthStatus(salesRank),
      hint: dashboard ? `${salesAttention.length || "No"} RFQ signals` : "Unavailable",
    },
    {
      id: "customers",
      label: "Customers",
      status: healthStatus(customersRank),
      hint: dashboard ? `${customerAttention.length || "No"} follow-ups` : "Unavailable",
    },
  ];

  const emptyReason =
    topAttention.length === 0
      ? "No cross-domain issues need attention right now. Production, materials, procurement, and commercial signals look stable."
      : null;

  return {
    brand: tenant.name,
    disclaimer: tenant.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: new Date().toISOString(),
    health,
    attention: topAttention,
    context: {
      productionAtRisk: atRiskOrders.length,
      materialShortages: (criticalMaterials.length + highMaterials.length) || 0,
      pendingRequisitions,
      supplierGaps,
      inventoryCritical: expiredQty > 0 ? inventory?.expiredBatches ?? 0 : 0,
      openAttention: topAttention.length,
    },
    emptyReason,
    planningNote:
      "Deterministic review from current workspace data. AI explanation is optional and does not change records or execute actions.",
    intelligence,
  };
}

export function toCompactDailyReviewContext(snapshot: DailyReviewSnapshot): CompactDailyReviewContext {
  return {
    health: snapshot.health.map((row) => ({ domain: row.label, status: row.status, hint: row.hint })),
    attention: snapshot.attention.slice(0, 5).map((row) => ({
      severity: row.severity,
      domain: row.domain,
      title: row.title,
      summary: row.summary,
      reason: row.reason,
    })),
    metrics: snapshot.context,
  };
}
