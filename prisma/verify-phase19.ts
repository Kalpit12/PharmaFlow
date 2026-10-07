import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { getCommandCenterSnapshot, toCompactCommandContext } from "../src/lib/server/command-center";
import { getDailyReviewSnapshot } from "../src/lib/server/daily-review";
import { getDashboardData } from "../src/lib/server/dashboard";
import type { TenantContext } from "../src/lib/server/errors";
import { getExecutionSnapshot } from "../src/lib/server/execution";
import { getInventorySnapshot, resolveInventoryFilters } from "../src/lib/server/inventory";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "../src/lib/server/materials";
import { getOperationsPlanner, resolvePlanningWindow } from "../src/lib/server/operations";
import { getProcurementSnapshot, resolveProcurementFilters } from "../src/lib/server/procurement";
import { getReportingSnapshot, resolveReportFilters } from "../src/lib/server/reports";
import { getSupplierSnapshot, resolveSupplierFilters } from "../src/lib/server/suppliers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase19Verify(prisma: PrismaClient) {
  const pageSource = readFileSync(join(process.cwd(), "src/app/(workspace)/command-center/page.tsx"), "utf8");
  const serverSource = readFileSync(join(process.cwd(), "src/lib/server/command-center.ts"), "utf8");
  const uiSource = readFileSync(join(process.cwd(), "src/components/command-center/CommandCenterWorkspace.tsx"), "utf8");

  assert(!/generateResponse|runProductionOrchestrator|chat\.completions|openaiAIProvider/i.test(pageSource + serverSource), "AI is not called during Command Center loading");
  assert(!/fetch\(\s*[\"']\/api\/ai/i.test(pageSource), "Page load must not call /api/ai");
  assert(/IntelligenceSurface/.test(uiSource), "Command Center includes operational intelligence");
  assert(!/fetch\(\s*[\"']\/api\/ai/i.test(uiSource), "Command Center explain does not use the mutating /api/ai orchestrator");
  assert(!/decideAction|decideWorkflow|createRequisitionDraft/i.test(uiSource), "Command Center is read-only");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && user, "Tenants required");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const other: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };

  const actionsBefore = await prisma.action.count({ where: { tenantId: tenant.id } });
  const workflowsBefore = await prisma.workflow.count({ where: { tenantId: tenant.id } });

  const snapshot = await getCommandCenterSnapshot(manager);
  assert(snapshot.health.length >= 5, "Command Center aggregation includes health strip");
  assert(Array.isArray(snapshot.signals), "Signals present");
  assert(snapshot.charts.length === 3, "Maximum three charts");
  assert(snapshot.summary.length === 3, "Business / Operations / Supply summary");

  for (let i = 1; i < snapshot.signals.length; i++) {
    const rank: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
    assert(
      rank[snapshot.signals[i - 1].severity] >= rank[snapshot.signals[i].severity],
      "Deterministic signal ordering by severity"
    );
  }

  const emptyish = await getCommandCenterSnapshot(other);
  assert(emptyish.brand.length > 0, "Empty tenant behavior produces a snapshot");
  const managerExecIds = new Set(snapshot.signals.filter((row) => row.id.startsWith("exec-")).map((row) => row.id));
  assert(
    !emptyish.signals.some((signal) => managerExecIds.has(signal.id)),
    "Tenant isolation for execution-derived signals"
  );

  const dashboard = await getDashboardData(manager);
  assert(dashboard.metrics.length > 0, "Existing dashboard numbers remain available");
  await getDailyReviewSnapshot(manager);
  await getReportingSnapshot(manager, resolveReportFilters({ view: "overview" }));
  await getOperationsPlanner(manager, resolvePlanningWindow({ weeks: "1" }));
  await getInventorySnapshot(manager, resolveInventoryFilters({ view: "overview" }));
  await getMaterialsSnapshot(manager, resolveMaterialsFilters({ view: "overview" }));
  await getProcurementSnapshot(manager, resolveProcurementFilters({ view: "all" }));
  await getSupplierSnapshot(manager, resolveSupplierFilters({ view: "all" }));
  await getExecutionSnapshot(manager);

  const compact = toCompactCommandContext(snapshot);
  const compactJson = JSON.stringify(compact);
  assert(!compactJson.includes(tenant.id), "No tenant UUID in AI context packet");
  assert(!/DATABASE_URL|postgres:\/\//i.test(compactJson), "No database credentials in context");
  assert(compact.signals.length <= 5, "Compact AI context");

  const actionsAfter = await prisma.action.count({ where: { tenantId: tenant.id } });
  const workflowsAfter = await prisma.workflow.count({ where: { tenantId: tenant.id } });
  assert(actionsAfter === actionsBefore, "No database mutation from viewing Command Center (actions)");
  assert(workflowsAfter === workflowsBefore, "No database mutation from viewing Command Center (workflows)");

  console.log("Phase 19 verification passed.");
}
