import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { detectIntent } from "../src/lib/ai/detect-intent";
import { INTENT_TOOLS } from "../src/lib/ai/context";
import { formatRate, scoreSupplierPerformance } from "../src/lib/supplier-performance/scoring";
import type { TenantContext } from "../src/lib/server/errors";
import {
  getSupplierPerformanceDetail,
  getSupplierPerformanceSnapshot,
  resolveSupplierPerformanceFilters,
} from "../src/lib/server/supplier-performance";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase25Verify(prisma: PrismaClient) {
  const sources = [
    readFileSync(join(process.cwd(), "src/lib/server/supplier-performance.ts"), "utf8"),
    readFileSync(join(process.cwd(), "src/lib/supplier-performance/scoring.ts"), "utf8"),
    readFileSync(join(process.cwd(), "src/components/supplier-performance/SupplierPerformanceWorkspace.tsx"), "utf8"),
  ].join("\n");
  assert(!/openai|chat\.completions|generateResponse/i.test(sources.replace("Explain supplier performance", "")), "Phase 25 normal usage performs ZERO OpenAI calls");
  assert(!/prisma migrate reset|db push --force-reset/i.test(sources), "No destructive database operations");

  assert(formatRate(0, 0) === "—", "Zero denominator handling");
  assert(formatRate(5, 10) === "50%", "Rate formatting");

  const insufficient = scoreSupplierPerformance({
    rfqsInvited: 1,
    rfqsResponded: 0,
    rfqsAwarded: 0,
    poCount: 0,
    orderedQuantity: 0,
    receivedQuantity: 0,
    receiptEventCount: 0,
    discrepancyEventCount: 0,
    hasKnownPrice: false,
    hasKnownLeadTime: false,
  });
  assert(insufficient.band === "INSUFFICIENT_DATA", "Insufficient history");

  const strong = scoreSupplierPerformance({
    rfqsInvited: 4,
    rfqsResponded: 4,
    rfqsAwarded: 2,
    poCount: 2,
    orderedQuantity: 100,
    receivedQuantity: 100,
    receiptEventCount: 4,
    discrepancyEventCount: 0,
    hasKnownPrice: true,
    hasKnownLeadTime: true,
  });
  assert(strong.band === "EXCELLENT" || strong.band === "STRONG", "Stable performance band");
  assert(strong.score !== null && strong.score >= 70, "Deterministic scoring");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const manager = await prisma.user.findFirst({ where: { tenantId: tenant?.id, role: "MANAGER" } });
  assert(tenant && tenantB && manager, "Tenants and manager required");

  const managerCtx: TenantContext = { tenantId: tenant.id, userId: manager.id, role: "MANAGER" };
  const otherCtx: TenantContext = { tenantId: tenantB.id, userId: manager.id, role: "MANAGER" };

  const suppliersBefore = await prisma.supplier.count({ where: { tenantId: tenant.id } });
  const rfqsBefore = await prisma.procurementRfq.count({ where: { tenantId: tenant.id } });
  const posBefore = await prisma.purchaseOrder.count({ where: { tenantId: tenant.id } });
  const lotsBefore = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });

  const snapshot = await getSupplierPerformanceSnapshot(managerCtx, resolveSupplierPerformanceFilters({ view: "all" }));
  assert(Array.isArray(snapshot.rows), "Supplier performance snapshot rows");
  assert(snapshot.planningNote.includes("Deterministic"), "Deterministic label present");
  assert(snapshot.kpis.some((kpi) => kpi.id === "completion"), "Completion KPI");

  const withHistory = snapshot.rows.filter((row) => row.hasHistory);
  for (const row of withHistory.slice(0, 5)) {
    assert(row.responseRateLabel === "—" || row.responseRateLabel.endsWith("%"), "RFQ response rate");
    assert(row.completionRateLabel === "—" || row.completionRateLabel.endsWith("%"), "Completion rate");
    assert(row.averageReceivingDelayLabel === "Timing data unavailable", "No fake timing metrics");
    if (row.orderedQuantity === 0) assert(row.completionRateLabel === "—", "Zero ordered quantity handling");
    if (row.rfqsInvited === 0) assert(row.responseRateLabel === "—", "Zero invited RFQ handling");
  }

  const active = snapshot.rows.filter((row) => row.status === "ACTIVE");
  const inactive = snapshot.rows.filter((row) => row.status === "INACTIVE");
  assert(active.length + inactive.length === snapshot.rows.length, "Active/inactive supplier handling");

  if (snapshot.rows[0]) {
    const detail = await getSupplierPerformanceDetail(managerCtx, snapshot.rows[0].supplierId);
    assert(detail.supplierId === snapshot.rows[0].supplierId, "Supplier detail loads");
    assert(detail.metrics.averageReceivingDelayLabel === "Timing data unavailable", "Detail timing unavailable");
  }

  const compareIds = snapshot.rows.slice(0, 2).map((row) => row.supplierId);
  if (compareIds.length >= 2) {
    const compared = await getSupplierPerformanceSnapshot(
      managerCtx,
      resolveSupplierPerformanceFilters({ compare: compareIds.join(",") })
    );
    assert(compared.compare.length <= 3, "Supplier comparison capped at 3");
  }

  const material = await prisma.product.findFirst({ where: { tenantId: tenant.id } });
  if (material) {
    const filtered = await getSupplierPerformanceSnapshot(
      managerCtx,
      resolveSupplierPerformanceFilters({ material: material.id })
    );
    assert(filtered.materialId === material.id, "Material filtering");
  }

  const other = await getSupplierPerformanceSnapshot(otherCtx, resolveSupplierPerformanceFilters({}));
  const managerIds = new Set(snapshot.rows.map((row) => row.supplierId));
  assert(!other.rows.some((row) => managerIds.has(row.supplierId)), "Tenant isolation of metrics");

  let crossTenant = false;
  if (snapshot.rows[0]) {
    try {
      await getSupplierPerformanceDetail(otherCtx, snapshot.rows[0].supplierId);
    } catch {
      crossTenant = true;
    }
    assert(crossTenant, "Tenant isolation");
  }

  const currencies = snapshot.rows.map((row) => row.orderedValueLabel);
  assert(!currencies.some((label) => /FX|converted/i.test(label)), "No FX conversion");

  const intent = detectIntent("Explain supplier performance");
  assert(intent.intent === "SUPPLIER_PERFORMANCE", "Explicit AI path only");
  assert(INTENT_TOOLS.SUPPLIER_PERFORMANCE.includes("get_supplier_performance"), "AI tool mapping");

  const suppliersAfter = await prisma.supplier.count({ where: { tenantId: tenant.id } });
  const rfqsAfter = await prisma.procurementRfq.count({ where: { tenantId: tenant.id } });
  const posAfter = await prisma.purchaseOrder.count({ where: { tenantId: tenant.id } });
  const lotsAfter = await prisma.inventoryLot.count({ where: { tenantId: tenant.id } });
  assert(suppliersAfter === suppliersBefore, "No supplier mutation");
  assert(rfqsAfter === rfqsBefore, "No RFQ mutation");
  assert(posAfter === posBefore, "No PO mutation");
  assert(lotsAfter === lotsBefore, "No inventory mutation");

  void Prisma;
  console.log("Phase 25 verification passed.");
}
