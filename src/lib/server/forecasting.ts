import { Prisma } from "@prisma/client";

import {
  buildMetric,
  daysUntil,
  horizonLabel,
  operationsWeeksForHorizon,
  parseForecastHorizon,
  periodComparison,
  projectRunRate,
  signalFromMetric,
} from "@/lib/forecasting/engine";
import type {
  CompactForecastContext,
  ForecastDomainOutlook,
  ForecastHorizonDays,
  ForecastRisk,
  ForecastSeriesPoint,
  ForecastSnapshot,
} from "@/lib/forecasting/types";
import { periodTotals } from "@/lib/server/analytics";
import { addUtcDays, trailingDays } from "@/lib/server/dates";
import type { TenantContext } from "@/lib/server/errors";
import { getInventorySnapshot, resolveInventoryFilters } from "@/lib/server/inventory";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { formatCount, formatKes } from "@/lib/server/money";
import { getOperationsPlanner, resolvePlanningWindow } from "@/lib/server/operations";
import { getProcurementSnapshot, resolveProcurementFilters } from "@/lib/server/procurement";
import { getTenant } from "@/lib/server/services/tenant";

const SEVERITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

function asNumber(value: { toString(): string } | number): number {
  if (typeof value === "number") return value;
  return Number(value.toString());
}

function formatMoney(value: number): string {
  return formatKes(new Prisma.Decimal(value));
}

export function resolveForecastHorizon(input?: { horizon?: string }): ForecastHorizonDays {
  return parseForecastHorizon(input?.horizon);
}

export function toCompactForecastContext(snapshot: ForecastSnapshot): CompactForecastContext {
  const pick = (row: ForecastSnapshot["sales"]) => ({
    currentValue: row.currentValue,
    projectedValue: row.projectedValue,
    direction: row.direction,
    growth: row.growth,
    confidence: row.confidence,
    explanation: row.explanation,
  });
  return {
    horizon: snapshot.horizonLabel,
    sales: pick(snapshot.sales),
    rfq: pick(snapshot.rfq),
    production: pick(snapshot.production),
    materials: pick(snapshot.materials),
    procurement: pick(snapshot.procurement),
    inventory: pick(snapshot.inventory),
    risks: snapshot.risks.slice(0, 5).map((row) => ({
      domain: row.domain,
      title: row.title,
      severity: row.severity,
      reason: row.reason,
    })),
  };
}

export async function getForecastSnapshot(
  ctx: TenantContext,
  horizon: ForecastHorizonDays = 30,
  now = new Date()
): Promise<ForecastSnapshot> {
  const tenant = await getTenant(ctx);
  const currentWindow = trailingDays(now, horizon);
  const priorWindow = trailingDays(addUtcDays(now, -horizon), horizon);
  const period = horizonLabel(horizon);

  const [currentTotals, priorTotals, materials, inventory, operations, procurement] = await Promise.all([
    periodTotals(ctx, currentWindow.start, currentWindow.end),
    periodTotals(ctx, priorWindow.start, priorWindow.end),
    getMaterialsSnapshot(ctx, resolveMaterialsFilters({ view: "requirements" })).catch(() => null),
    getInventorySnapshot(ctx, resolveInventoryFilters({ view: "overview" })).catch(() => null),
    getOperationsPlanner(ctx, resolvePlanningWindow({ weeks: operationsWeeksForHorizon(horizon) })).catch(() => null),
    getProcurementSnapshot(ctx, resolveProcurementFilters({ view: "all" })).catch(() => null),
  ]);

  const currentRevenue = asNumber(currentTotals.revenue);
  const priorRevenue = asNumber(priorTotals.revenue);
  const sales = buildMetric({
    metric: "Revenue outlook",
    current: currentRevenue,
    prior: priorRevenue,
    dataPoints: (currentRevenue > 0 ? 1 : 0) + (priorRevenue > 0 ? 1 : 0),
    format: formatMoney,
    period,
    explanation: "Run-rate from realized CONFIRMED/FULFILLED orders in the matching lookback window.",
  });

  const rfq = buildMetric({
    metric: "RFQ demand",
    current: currentTotals.rfqs,
    prior: priorTotals.rfqs,
    dataPoints: (currentTotals.rfqs > 0 ? 1 : 0) + (priorTotals.rfqs > 0 ? 1 : 0),
    format: formatCount,
    period,
    explanation: "RFQ volume in the recent window versus the prior window of the same length.",
  });

  const dueInHorizon =
    operations?.orders.filter((order) => {
      const days = daysUntil(order.dueDate, now);
      return days !== null && days >= 0 && days <= horizon;
    }).length ?? 0;
  const atRisk = operations?.orders.filter((order) => order.displayStatus === "AT_RISK").length ?? 0;
  const unscheduled = operations?.orders.filter((order) => order.displayStatus === "UNSCHEDULED").length ?? 0;
  const production = buildMetric({
    metric: "Production pressure",
    current: dueInHorizon,
    prior: atRisk,
    dataPoints: operations ? 2 : 0,
    format: formatCount,
    period,
    explanation: "Open production due within the horizon. Comparison uses current at-risk count as pressure context.",
  });

  const shortages = materials?.materials.filter((row) => row.shortage) ?? [];
  const tight = materials?.materials.filter((row) => row.status === "TIGHT" || row.risk === "LOW") ?? [];
  const likelyAttention =
    materials?.materials.filter((row) => {
      if (row.risk === "OK") return false;
      const days = daysUntil(row.earliestDueDate, now);
      return days !== null && days <= horizon;
    }) ?? [];
  const materialsMetric = buildMetric({
    metric: "Material risk",
    current: shortages.length,
    prior: tight.length,
    dataPoints: materials ? 2 : 0,
    format: formatCount,
    period,
    explanation: "Confirmed shortages versus tight coverage from the Phase 14 material engine.",
  });

  const constrained =
    inventory?.items.filter(
      (item) => item.health === "OUT_OF_STOCK" || item.health === "CRITICAL" || item.shortfall > 0
    ) ?? [];
  const lowStock = inventory?.items.filter((item) => item.health === "LOW").length ?? 0;
  const inventoryMetric = buildMetric({
    metric: "Inventory constraint",
    current: constrained.length,
    prior: lowStock,
    dataPoints: inventory ? 2 : 0,
    format: formatCount,
    period,
    explanation: "Items already constrained (critical, out of stock, or shortfall) versus low-stock pressure.",
  });

  const pending = procurement?.pendingReviewCount ?? 0;
  const criticalProc = procurement?.rows.filter((row) => row.risk === "CRITICAL").length ?? 0;
  const procurementMetric = buildMetric({
    metric: "Procurement urgency",
    current: pending,
    prior: criticalProc,
    dataPoints: procurement ? 2 : 0,
    format: formatCount,
    period,
    explanation: "Pending requisition review versus critical procurement requirements. No purchase orders are created.",
  });

  const projectedRevenue = projectRunRate(currentRevenue, priorRevenue, sales.confidence);
  const series: ForecastSeriesPoint[] = [
    { label: "Prior", value: priorRevenue, kind: "historical" },
    { label: "Recent", value: currentRevenue, kind: "historical" },
  ];
  if (projectedRevenue !== null) {
    series.push({ label: "Outlook", value: projectedRevenue, kind: "projected" });
  }

  const signals = [
    signalFromMetric("Demand", rfq),
    signalFromMetric("Revenue", sales),
    atRisk > 0 ? "Production pressure increasing" : null,
    shortages.length > 0
      ? "Material shortage projected"
      : likelyAttention.length > 0
        ? "Material attention likely within horizon"
        : null,
    pending > 0 ? "Procurement review outstanding" : null,
  ].filter((row): row is string => Boolean(row));

  const risks: ForecastRisk[] = [];

  for (const row of likelyAttention.slice(0, 5)) {
    risks.push({
      id: `mat-${row.productId}`,
      domain: "materials",
      title: `${row.name} likely constrained`,
      severity: row.risk === "CRITICAL" ? "CRITICAL" : row.risk === "HIGH" ? "HIGH" : "MEDIUM",
      projectedDate: row.earliestDueDate,
      reason: row.shortage
        ? `Shortage against open production. Earliest due within ${horizon} days.`
        : `Coverage is ${row.status.toLowerCase()}. Earliest affected order due within the horizon.`,
      relatedId: row.productId,
      actionHref: `/materials?material=${row.productId}`,
    });
  }

  if (atRisk > 0) {
    const earliest = [...(operations?.orders.filter((order) => order.displayStatus === "AT_RISK") ?? [])].sort((a, b) =>
      a.dueDate.localeCompare(b.dueDate)
    )[0];
    risks.push({
      id: "prod-at-risk",
      domain: "production",
      title: "At-risk production workload",
      severity: "HIGH",
      projectedDate: earliest?.dueDate ?? null,
      reason: `${atRisk} order${atRisk === 1 ? "" : "s"} at risk · ${dueInHorizon} due within ${horizon} days · ${unscheduled} unscheduled.`,
      relatedId: earliest?.id ?? null,
      actionHref: "/operations",
    });
  }

  if (constrained.length > 0) {
    risks.push({
      id: "inv-constrained",
      domain: "inventory",
      title: "Inventory may remain constrained",
      severity: constrained.some((item) => item.health === "OUT_OF_STOCK") ? "HIGH" : "MEDIUM",
      projectedDate: null,
      reason: `${constrained.length} item${constrained.length === 1 ? "" : "s"} are out of stock, critical, or already in shortfall.`,
      relatedId: null,
      actionHref: "/inventory?view=health",
    });
  }

  if (pending > 0 || criticalProc > 0) {
    risks.push({
      id: "proc-pending",
      domain: "procurement",
      title: "Procurement urgency within horizon",
      severity: criticalProc > 0 ? "HIGH" : "MEDIUM",
      projectedDate: null,
      reason: `${pending} pending review · ${criticalProc} critical requirement${criticalProc === 1 ? "" : "s"}.`,
      relatedId: null,
      actionHref: "/procurement?view=needs-review",
    });
  }

  const rfqDir = periodComparison(currentTotals.rfqs, priorTotals.rfqs);
  if (rfqDir.direction === "up") {
    risks.push({
      id: "rfq-up",
      domain: "demand",
      title: "RFQ demand accelerating",
      severity: "MEDIUM",
      projectedDate: null,
      reason: `RFQ volume ${rfq.growth} versus the prior ${horizon}-day window.`,
      relatedId: null,
      actionHref: "/dashboard",
    });
  }

  risks.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      (a.projectedDate ?? "9999").localeCompare(b.projectedDate ?? "9999") ||
      a.id.localeCompare(b.id)
  );

  const outlook: ForecastDomainOutlook[] = [
    {
      title: "Sales",
      href: "/dashboard",
      metric: sales,
      notes: [
        `${formatCount(currentTotals.orders)} realized orders in the recent window.`,
        sales.confidence === "INSUFFICIENT" ? "Insufficient historical data" : `Outlook ${sales.projectedValue ?? "—"}.`,
      ],
    },
    {
      title: "Demand",
      href: "/dashboard",
      metric: rfq,
      notes: [
        `${formatCount(currentTotals.rfqs)} RFQs recently vs ${formatCount(priorTotals.rfqs)} prior.`,
        rfq.growth === "—" ? "Growth unavailable (zero prior volume)." : `Direction ${rfq.direction}.`,
      ],
    },
    {
      title: "Inventory",
      href: "/inventory",
      metric: inventoryMetric,
      notes: inventory
        ? [`${constrained.length} constrained · ${lowStock} low stock.`]
        : ["Inventory snapshot unavailable."],
    },
    {
      title: "Production",
      href: "/operations",
      metric: production,
      notes: operations
        ? [
            `${dueInHorizon} due in horizon · ${atRisk} at risk · capacity ${operations.kpis.find((row) => row.id === "utilization")?.value ?? "—"}.`,
          ]
        : ["Production planner unavailable."],
    },
    {
      title: "Materials",
      href: "/materials",
      metric: materialsMetric,
      notes: materials
        ? [`${shortages.length} shortages · ${likelyAttention.length} likely attention within horizon.`]
        : ["Material engine unavailable."],
    },
    {
      title: "Procurement",
      href: "/procurement",
      metric: procurementMetric,
      notes: procurement
        ? [`${pending} pending review. Planning only — no purchase orders.`]
        : ["Procurement snapshot unavailable."],
    },
  ];

  return {
    brand: tenant.name,
    disclaimer: tenant.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: now.toISOString(),
    horizon,
    horizonLabel: period,
    sales,
    rfq,
    inventory: inventoryMetric,
    production,
    materials: materialsMetric,
    procurement: procurementMetric,
    series,
    signals,
    risks: risks.slice(0, 8),
    outlook,
    planningNote:
      "Deterministic outlook from rolling historical windows, recent-vs-prior trend, and existing domain engines. No model calls on load.",
  };
}
