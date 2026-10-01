import type {
  CommandActivityItem,
  CommandCenterSnapshot,
  CommandHealthMetric,
  CommandRisk,
  CommandSignal,
  CommandSummaryBlock,
  CompactCommandContext,
} from "@/lib/command-center/types";
import type { DailySeverity } from "@/lib/daily-review/types";
import { getDailyReviewSnapshot } from "@/lib/server/daily-review";
import { getDashboardData } from "@/lib/server/dashboard";
import type { TenantContext } from "@/lib/server/errors";
import { getExecutionSnapshot } from "@/lib/server/execution";
import { getProductionExecutionSignals } from "@/lib/server/production-execution";
import { countProcurementRfqsAwaitingEvaluation } from "@/lib/server/procurement-rfqs";
import { countAwaitingReceipt } from "@/lib/server/receiving";
import { countPendingPurchaseOrders } from "@/lib/server/purchase-orders";
import { countSupplierPerformanceAttention } from "@/lib/server/supplier-performance";
import { getOperationsPlanner, resolvePlanningWindow } from "@/lib/server/operations";
import { getTenant } from "@/lib/server/services/tenant";
import { buildCommandCenterAnalytics } from "@/lib/server/command-center-analytics";
import { getPlanningOutlook } from "@/lib/server/scenarios";

const SEVERITY_RANK: Record<DailySeverity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

function mapHealthSeverity(
  status: string
): CommandHealthMetric["severity"] {
  if (status === "CRITICAL") return "CRITICAL";
  if (status === "ATTENTION" || status === "LIMITED_DATA") return "ATTENTION";
  if (status === "HEALTHY" || status === "OK") return "HEALTHY";
  if (status === "LIMITED") return "LIMITED";
  return "NEUTRAL";
}

function domainHref(domain: string): string {
  switch (domain) {
    case "production":
      return "/operations";
    case "materials":
      return "/materials";
    case "procurement":
      return "/procurement";
    case "inventory":
      return "/inventory";
    case "suppliers":
      return "/suppliers";
    case "sales":
      return "/dashboard";
    case "customers":
      return "/customers";
    default:
      return "/daily-review";
  }
}

export function toCompactCommandContext(snapshot: CommandCenterSnapshot): CompactCommandContext {
  return {
    health: snapshot.health.slice(0, 7).map((row) => ({
      label: row.label,
      value: row.value,
      severity: row.severity,
    })),
    signals: snapshot.signals.slice(0, 5).map((row) => ({
      severity: row.severity,
      domain: row.domain,
      title: row.title,
      explanation: row.explanation,
    })),
    actionQueue: {
      needsReview: snapshot.actionQueue.needsReview,
      ready: snapshot.actionQueue.ready,
      recentlyExecuted: snapshot.actionQueue.recentlyExecuted,
      failedOrBlocked: snapshot.actionQueue.failedOrBlocked,
    },
    risks: snapshot.risks.slice(0, 6).map((row) => ({
      category: row.category,
      level: row.level,
      explanation: row.explanation,
    })),
  };
}

export async function getCommandCenterSnapshot(ctx: TenantContext): Promise<CommandCenterSnapshot> {
  const tenant = await getTenant(ctx);
  const [dashboard, daily, execution, operations, rfqsAwaitingEvaluation, pendingPurchaseOrders, awaitingReceipt, supplierPerfAttention, planningOutlook, productionExecution] = await Promise.all([
    getDashboardData(ctx).catch(() => null),
    getDailyReviewSnapshot(ctx),
    getExecutionSnapshot(ctx),
    getOperationsPlanner(ctx, resolvePlanningWindow({ weeks: "1" })).catch(() => null),
    countProcurementRfqsAwaitingEvaluation(ctx).catch(() => 0),
    countPendingPurchaseOrders(ctx).catch(() => 0),
    countAwaitingReceipt(ctx).catch(() => 0),
    countSupplierPerformanceAttention(ctx).catch(() => 0),
    getPlanningOutlook(ctx).catch(() => ({
      currentState: "Planning outlook unavailable",
      topRisk: "—",
      scenarioOpportunity: "Open scenarios workspace",
      projectedImpact: "—",
      href: "/scenarios",
    })),
    getProductionExecutionSignals(ctx),
  ]);
  const intelligence = daily.intelligence;

  const metric = (id: string) => dashboard?.metrics.find((row) => row.id === id);

  const utilization = operations?.kpis.find((row) => row.id === "utilization")?.value ?? "—";
  const atRisk = operations?.kpis.find((row) => row.id === "risk")?.value ?? String(daily.context.productionAtRisk);

  const health: CommandHealthMetric[] = [
    {
      id: "revenue",
      label: "Revenue",
      value: metric("revenue")?.value ?? "—",
      trend: metric("revenue")?.trend ?? "—",
      severity: "NEUTRAL",
      href: "/dashboard",
    },
    {
      id: "rfq",
      label: "Sales / RFQ",
      value: metric("rfqs")?.value ?? "—",
      trend: metric("rfqs")?.trend ?? "—",
      severity: daily.health.find((h) => h.id === "sales")?.status === "ATTENTION" ? "ATTENTION" : "NEUTRAL",
      href: "/dashboard",
    },
    {
      id: "production",
      label: "Production",
      value: utilization,
      trend: `${atRisk} at risk`,
      severity: mapHealthSeverity(daily.health.find((h) => h.id === "production")?.status ?? "HEALTHY"),
      href: "/operations",
    },
    {
      id: "inventory",
      label: "Inventory",
      value: daily.health.find((h) => h.id === "inventory")?.hint ?? "—",
      trend: daily.health.find((h) => h.id === "inventory")?.status ?? "—",
      severity: mapHealthSeverity(daily.health.find((h) => h.id === "inventory")?.status ?? "HEALTHY"),
      href: "/inventory",
    },
    {
      id: "materials",
      label: "Material risk",
      value: String(daily.context.materialShortages),
      trend: daily.health.find((h) => h.id === "materials")?.status ?? "—",
      severity: mapHealthSeverity(daily.health.find((h) => h.id === "materials")?.status ?? "HEALTHY"),
      href: "/materials",
    },
    {
      id: "procurement",
      label: "Procurement",
      value: String(daily.context.pendingRequisitions),
      trend: daily.health.find((h) => h.id === "procurement")?.status ?? "—",
      severity: mapHealthSeverity(daily.health.find((h) => h.id === "procurement")?.status ?? "HEALTHY"),
      href: "/procurement",
    },
    {
      id: "execution",
      label: "Execution queue",
      value: String(execution.kpis.needsReview),
      trend: `${execution.kpis.ready} ready`,
      severity: execution.kpis.needsReview > 0 ? "ATTENTION" : execution.kpis.blockedOrFailed > 0 ? "ATTENTION" : "HEALTHY",
      href: "/execution",
    },
  ];

  const signals: CommandSignal[] = daily.attention.map((item) => ({
    id: item.id,
    severity: item.severity,
    domain: item.domain,
    title: item.title,
    explanation: item.summary,
    entity: item.reason,
    nextStep: item.actionLabel,
    href: item.href,
    sortDue: item.reason,
  }));

  // Derived signals can restate an item already surfaced by daily attention.
  const signalIds = new Set(signals.map((row) => row.id));
  const addSignal = (signal: CommandSignal) => {
    if (signalIds.has(signal.id)) return;
    signalIds.add(signal.id);
    signals.push(signal);
  };

  // Execution pending items as signals when not already covered
  for (const item of execution.queue.slice(0, 4)) {
    if (signals.some((row) => row.title === item.title)) continue;
    addSignal({
      id: `exec-${item.id}`,
      severity: item.priority === "CRITICAL" || item.priority === "HIGH" ? "HIGH" : "MEDIUM",
      domain: "execution",
      title: item.title,
      explanation: item.reason,
      entity: item.targetLabel,
      nextStep: "Review in Execution",
      href: "/execution",
      sortDue: item.createdAt,
    });
  }

  if (productionExecution) {
    if (productionExecution.late > 0) {
      addSignal({
        id: "prod-exec-late",
        severity: "CRITICAL",
        domain: "production",
        title: `${productionExecution.late} late production order${productionExecution.late === 1 ? "" : "s"}`,
        explanation: "Planned end has passed while execution remains incomplete.",
        entity: "Production execution",
        nextStep: "Inspect shop floor",
        href: "/execution/production?view=at-risk",
        sortDue: "0",
      });
    }
    if (productionExecution.paused > 0) {
      addSignal({
        id: "prod-exec-paused",
        severity: "HIGH",
        domain: "production",
        title: `${productionExecution.paused} production order${productionExecution.paused === 1 ? "" : "s"} paused`,
        explanation: "Active production is interrupted pending resume or complete.",
        entity: "Production execution",
        nextStep: "Resume or complete",
        href: "/execution/production?view=paused",
        sortDue: "0",
      });
    }
    if (productionExecution.active > 0) {
      addSignal({
        id: "prod-exec-active",
        severity: "INFO",
        domain: "production",
        title: `${productionExecution.active} production order${productionExecution.active === 1 ? "" : "s"} active`,
        explanation: "Shop-floor execution currently in progress.",
        entity: "Production execution",
        nextStep: "Open production execution",
        href: "/execution/production?view=active",
        sortDue: "0",
      });
    } else if (productionExecution.atRisk > 0 && productionExecution.late === 0) {
      addSignal({
        id: "prod-exec-risk",
        severity: "MEDIUM",
        domain: "production",
        title: `${productionExecution.atRisk} production order${productionExecution.atRisk === 1 ? "" : "s"} at risk`,
        explanation: "Deterministic execution risk requires operator attention.",
        entity: "Production execution",
        nextStep: "Inspect shop floor",
        href: "/execution/production?view=at-risk",
        sortDue: "0",
      });
    }
  }

  if (rfqsAwaitingEvaluation > 0) {
    addSignal({
      id: "proc-rfq-eval",
      severity: "MEDIUM",
      domain: "procurement",
      title: `${rfqsAwaitingEvaluation} RFQ${rfqsAwaitingEvaluation === 1 ? "" : "s"} awaiting evaluation`,
      explanation: "Supplier responses recorded — internal award decision pending.",
      entity: "Procurement RFQ",
      nextStep: "Review in RFQ Management",
      href: "/rfqs?status=evaluation",
      sortDue: "0",
    });
  }

  if (pendingPurchaseOrders > 0) {
    addSignal({
      id: "proc-po-pending",
      severity: "MEDIUM",
      domain: "procurement",
      title: `${pendingPurchaseOrders} purchase order${pendingPurchaseOrders === 1 ? "" : "s"} awaiting approval`,
      explanation: "Internal PO approval required before purchasing readiness.",
      entity: "Purchase order",
      nextStep: "Review in Purchase Orders",
      href: "/purchase-orders?view=pending",
      sortDue: "0",
    });
  }

  if (awaitingReceipt > 0) {
    addSignal({
      id: "proc-receiving",
      severity: "MEDIUM",
      domain: "procurement",
      title: `${awaitingReceipt} purchase order${awaitingReceipt === 1 ? "" : "s"} awaiting receipt`,
      explanation: "Approved POs ready to receive into inventory.",
      entity: "Receiving",
      nextStep: "Open Receiving workspace",
      href: "/receiving?view=awaiting",
      sortDue: "0",
    });
  }

  if (supplierPerfAttention > 0) {
    addSignal({
      id: "proc-supplier-perf",
      severity: "MEDIUM",
      domain: "procurement",
      title: "Supplier performance requires attention",
      explanation: `${supplierPerfAttention} supplier${supplierPerfAttention === 1 ? "" : "s"} in Watch/Risk bands from deterministic history.`,
      entity: "Supplier performance",
      nextStep: "Open Supplier Performance",
      href: "/supplier-performance?view=attention",
      sortDue: "0",
    });
  }

  signals.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.sortDue.localeCompare(b.sortDue) ||
      a.id.localeCompare(b.id)
  );

  const summary: CommandSummaryBlock[] = [
    {
      id: "business",
      title: "Business",
      href: "/dashboard",
      lines: [
        { label: "Revenue", value: metric("revenue")?.value ?? "Unavailable", available: Boolean(metric("revenue")) },
        {
          label: "RFQ momentum",
          value: metric("rfqs") ? `${metric("rfqs")!.value} (${metric("rfqs")!.trend})` : "Unavailable",
          available: Boolean(metric("rfqs")),
        },
        {
          label: "Commercial signal",
          value: dashboard?.attention[0]?.title ?? daily.health.find((h) => h.id === "customers")?.hint ?? "Unavailable",
          available: Boolean(dashboard?.attention[0] || daily.health.find((h) => h.id === "customers")),
        },
      ],
    },
    {
      id: "operations",
      title: "Operations",
      href: "/operations",
      lines: [
        { label: "Capacity", value: utilization === "—" ? "Unavailable" : utilization, available: utilization !== "—" },
        {
          label: "At-risk orders",
          value: String(daily.context.productionAtRisk),
          available: true,
        },
        {
          label: "Material shortages",
          value: String(daily.context.materialShortages),
          available: true,
        },
      ],
    },
    {
      id: "supply",
      title: "Supply",
      href: "/procurement",
      lines: [
        {
          label: "Inventory exposure",
          value: daily.context.inventoryCritical > 0 ? `${daily.context.inventoryCritical} critical` : daily.health.find((h) => h.id === "inventory")?.hint ?? "—",
          available: true,
        },
        {
          label: "Procurement attention",
          value: String(daily.context.pendingRequisitions),
          available: true,
        },
        {
          label: "Supplier coverage",
          value:
            daily.health.find((h) => h.id === "suppliers")?.status === "LIMITED_DATA"
              ? "Limited data"
              : daily.context.supplierGaps > 0
                ? `${daily.context.supplierGaps} gaps`
                : daily.health.find((h) => h.id === "suppliers")?.hint ?? "—",
          available: true,
        },
      ],
    },
  ];

  const actionQueue = {
    needsReview: execution.kpis.needsReview,
    ready: execution.kpis.ready,
    recentlyExecuted: execution.kpis.executedToday,
    failedOrBlocked: execution.kpis.blockedOrFailed,
    preview: [...execution.queue, ...execution.history]
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        domain: item.domain,
        href: "/execution",
      })),
  };

  const salesPoints = dashboard?.sales["30D"] ?? [];
  const charts = [
    {
      id: "sales" as const,
      title: "Revenue / sales trend",
      question: "How is commercial momentum moving?",
      kind: "sales" as const,
      sales: salesPoints,
      empty: salesPoints.length === 0,
    },
    {
      id: "production" as const,
      title: "Production signal",
      question: "Where is production pressure?",
      kind: "bars" as const,
      bars: [
        { label: "At risk", value: daily.context.productionAtRisk },
        { label: "Unscheduled", value: Number(operations?.kpis.find((k) => k.id === "unscheduled")?.value ?? 0) || 0 },
        { label: "Conflicts", value: operations?.conflicts.length ?? 0 },
      ],
      empty: false,
    },
    {
      id: "supply" as const,
      title: "Inventory / material risk",
      question: "Where is supply exposure?",
      kind: "bars" as const,
      bars: [
        { label: "Materials", value: daily.context.materialShortages },
        { label: "Procurement", value: daily.context.pendingRequisitions },
        { label: "Inventory", value: daily.context.inventoryCritical },
        { label: "Supplier gaps", value: daily.context.supplierGaps },
      ],
      empty: false,
    },
  ];

  const risks: CommandRisk[] = [];
  const pushRisk = (id: string, category: string, level: DailySeverity, explanation: string, domain: string, href: string) => {
    if (level === "INFO" || level === "LOW") return;
    risks.push({ id, category, level, explanation, domain, href });
  };

  for (const h of daily.health) {
    if (h.status === "CRITICAL" || h.status === "ATTENTION" || h.status === "LIMITED_DATA") {
      pushRisk(
        `risk-${h.id}`,
        h.id === "sales" || h.id === "customers" ? "Commercial" : h.label,
        h.status === "CRITICAL" ? "CRITICAL" : "HIGH",
        h.hint,
        h.id,
        domainHref(h.id)
      );
    }
  }
  if (execution.kpis.needsReview > 0 || execution.kpis.blockedOrFailed > 0) {
    pushRisk(
      "risk-execution",
      "Execution",
      execution.kpis.blockedOrFailed > 0 ? "HIGH" : "MEDIUM",
      `${execution.kpis.needsReview} need review · ${execution.kpis.blockedOrFailed} blocked/failed`,
      "execution",
      "/execution"
    );
  }
  if (productionExecution && (productionExecution.late > 0 || productionExecution.paused > 0)) {
    pushRisk(
      "risk-production-execution",
      "Production execution",
      productionExecution.late > 0 ? "CRITICAL" : "HIGH",
      `${productionExecution.late} late · ${productionExecution.paused} paused · ${productionExecution.active} active`,
      "production",
      "/execution/production"
    );
  }
  risks.sort((a, b) => SEVERITY_RANK[b.level] - SEVERITY_RANK[a.level] || a.id.localeCompare(b.id));

  const activity: CommandActivityItem[] = (dashboard?.activity ?? []).slice(0, 10).map((item) => ({
    id: item.id,
    title: item.title,
    entity: item.detail,
    domain: "Activity",
    at: item.time,
    href: "/dashboard",
  }));

  const analytics = await buildCommandCenterAnalytics(ctx, { dashboard, operations });

  return {
    brand: tenant.name,
    disclaimer: tenant.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: new Date().toISOString(),
    contextLabel: new Date().toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
    health,
    signals: signals.slice(0, 8),
    summary,
    actionQueue,
    charts,
    analytics,
    risks: risks.slice(0, 8),
    activity,
    salesRanges: dashboard?.sales ?? { "7D": [], "30D": [], "90D": [], "12M": [] },
    emptyReason:
      signals.length === 0 && execution.kpis.needsReview === 0
        ? "No cross-domain management signals require attention right now."
        : null,
    planningNote:
      "Command Center composes Dashboard, Daily Review, Operations, Execution, Operational Intelligence, and Planning Outlook. Read-only. No model calls on load.",
    intelligence,
    planningOutlook,
  };
}
