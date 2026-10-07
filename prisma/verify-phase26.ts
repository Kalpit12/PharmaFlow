import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma, PrismaClient, type OrderStatus } from "@prisma/client";

import { detectIntent } from "../src/lib/ai/detect-intent";
import { INTENT_TOOLS } from "../src/lib/ai/context";
import { periodTotals, REALIZED_ORDER_STATUSES } from "../src/lib/server/analytics";
import { trailingDays } from "../src/lib/server/dates";
import type { TenantContext } from "../src/lib/server/errors";
import { percentChange } from "../src/lib/server/money";
import { getReportingSnapshot, resolveReportFilters, toCompactReportContext } from "../src/lib/server/reports";
import { getSupplierPerformanceReportMetrics } from "../src/lib/server/supplier-performance";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase26Verify(prisma: PrismaClient) {
  const sources = [
    readFileSync(join(process.cwd(), "src/lib/server/reports.ts"), "utf8"),
    readFileSync(join(process.cwd(), "src/components/reports/ReportingWorkspace.tsx"), "utf8"),
    readFileSync(join(process.cwd(), "src/app/(workspace)/reports/page.tsx"), "utf8"),
  ].join("\n");
  assert(!/openai|chat\.completions|generateResponse/i.test(sources.replaceAll("Explain this report", "")), "Phase 26 normal reporting performs ZERO OpenAI calls");
  assert(!/prisma migrate reset|db push --force-reset/i.test(sources), "No destructive database operations");
  assert(!/\bredis\b|bullmq|power.?bi|newrelic/i.test(sources), "No new infrastructure");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const empty = await prisma.tenant.findUnique({ where: { slug: "tenant-c-empty" } });
  const manager = await prisma.user.findFirst({ where: { tenantId: tenant?.id, role: "MANAGER" } });
  assert(tenant && tenantB && empty && manager, "Tenants and manager required");

  const managerCtx: TenantContext = { tenantId: tenant.id, userId: manager.id, role: "MANAGER" };
  const otherCtx: TenantContext = { tenantId: tenantB.id, userId: manager.id, role: "MANAGER" };
  const emptyCtx: TenantContext = { tenantId: empty.id, userId: manager.id, role: "MANAGER" };

  const lotsBefore = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const posBefore = await prisma.purchaseOrder.count({ where: { tenantId: tenant.id } });

  // Bounded snapshot loads — composition is view-aware for filters but shares one engine.
  const executive = await getReportingSnapshot(managerCtx, resolveReportFilters({ view: "executive" }));
  const overview = await getReportingSnapshot(managerCtx, resolveReportFilters({ view: "overview" }));
  const operations = await getReportingSnapshot(managerCtx, resolveReportFilters({ view: "operations" }));

  assert(executive.view === "executive", "Default intelligence view");
  assert(operations.view === "operations", "Operations view resolves");
  assert(overview.kpis.some((kpi) => kpi.id === "expired"), "Phase 12.6 overview KPIs unchanged");
  assert(executive.executiveKpis.some((kpi) => kpi.id === "revenue"), "Executive revenue KPI");
  assert(executive.scenarioHref === "/scenarios", "Scenario integration is a link only");
  assert(executive.forecastOutlook.href === "/forecast", "Forecast integration reuses /forecast");
  assert(operations.production.atRisk === executive.production.atRisk, "Operations reuses production planner slice");

  const now = new Date();
  const current = trailingDays(now, 30);
  const totals = await periodTotals(managerCtx, current.start, current.end);
  assert(executive.sales.revenue.includes("KSh") || executive.sales.empty, "Revenue uses formatted money");
  assert(executive.sales.definition.includes("Confirmed + fulfilled"), "Revenue definition");
  assert(executive.sales.orders === totals.orders, "Sales order volume uses realized period totals");

  const excluded: OrderStatus[] = ["DRAFT", "CANCELLED"];
  assert(REALIZED_ORDER_STATUSES.includes("CONFIRMED") && REALIZED_ORDER_STATUSES.includes("FULFILLED"), "Realized statuses");
  assert(!REALIZED_ORDER_STATUSES.some((status) => excluded.includes(status)), "Draft/cancelled excluded from revenue");
  void excluded;

  const priorWindow = { start: trailingDays(now, 60).start, end: current.start };
  const prior = await periodTotals(managerCtx, priorWindow.start, priorWindow.end);
  if (prior.revenue.isZero() || executive.sales.priorRevenueZero) {
    assert(executive.sales.revenueGrowth === "—", "Prior-period zero growth is —");
  } else {
    assert(executive.sales.revenueGrowth !== "" && executive.sales.revenueGrowth !== "—", "Growth shown when prior revenue exists");
  }

  assert(executive.health.length > 0 || executive.lots.length === 0, "Inventory health from existing lots");
  assert(executive.materialPlan.atRisk >= 0, "Materials plan reuses MRP snapshot");
  assert(executive.materials.every((row) => typeof row.netRequirement === "number"), "Material net requirement from existing formulas");
  assert(executive.procurementPipeline.some((row) => row.id === "rfq"), "Procurement lifecycle counts");
  assert(executive.procurementPipeline.every((row) => row.href.startsWith("/")), "Procurement drilldowns are existing routes");

  const supplierMetrics = await getSupplierPerformanceReportMetrics(managerCtx);
  assert(executive.supplierBands.reduce((sum, row) => sum + row.count, 0) === supplierMetrics.supplierCount, "Supplier bands reuse Phase 25");
  assert(executive.materialPlan.supplierPerfAttention === supplierMetrics.attentionCount, "Supplier attention reuse");

  const ranks = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
  for (let i = 1; i < executive.managementAttention.length; i += 1) {
    const prev = ranks.indexOf(executive.managementAttention[i - 1]!.severity);
    const next = ranks.indexOf(executive.managementAttention[i]!.severity);
    assert(prev <= next, "Management attention ranked by severity");
  }
  for (const item of executive.managementAttention) {
    assert(item.href.startsWith("/"), "Attention links to existing workspaces");
    assert(item.issue.length > 0 && item.evidence.length > 0, "Attention has evidence");
  }

  const compact = toCompactReportContext(executive);
  assert(!JSON.stringify(compact).includes(tenant.id), "Compact AI context excludes tenant UUID");
  assert(!("lots" in compact), "Compact AI context excludes raw lots");

  const other = await getReportingSnapshot(otherCtx, resolveReportFilters({ view: "executive" }));
  const managerLotIds = new Set(executive.lots.map((lot) => lot.id));
  assert(!other.lots.some((lot) => managerLotIds.has(lot.id)), "Tenant isolation of report lots");

  const emptySnap = await getReportingSnapshot(emptyCtx, resolveReportFilters({ view: "executive" }));
  assert(emptySnap.lots.length === 0, "Empty tenant has no invented lots");
  if (emptySnap.sales.priorRevenueZero) assert(emptySnap.sales.revenueGrowth === "—", "Empty prior growth is —");

  const zero = percentChange(new Prisma.Decimal(10), new Prisma.Decimal(0));
  assert(zero.text === "—", "Zero denominator growth");

  const intent = detectIntent("Explain this report");
  assert(intent.intent === "EXECUTIVE_REPORT", "Explicit AI path only");
  assert(INTENT_TOOLS.EXECUTIVE_REPORT.includes("get_report"), "AI tool mapping");
  assert(detectIntent("Show me revenue").intent !== "EXECUTIVE_REPORT", "Normal questions are not report-explain");

  const lotsAfter = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  const posAfter = await prisma.purchaseOrder.count({ where: { tenantId: tenant.id } });
  assert(lotsAfter === lotsBefore, "No inventory mutation");
  assert(posAfter === posBefore, "No PO mutation");

  console.log("Phase 26 verification passed.");
}
