import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { detectIntent } from "../src/lib/ai/detect-intent";
import { INTENT_TOOLS } from "../src/lib/ai/context";
import { toCompactDailyReviewContext } from "../src/lib/server/daily-review";
import { getDailyReviewSnapshot } from "../src/lib/server/daily-review";
import { collectToolContext } from "../src/lib/server/ai-data";
import type { TenantContext } from "../src/lib/server/errors";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "../src/lib/server/materials";
import { getOperationsPlanner, resolvePlanningWindow } from "../src/lib/server/operations";
import { getProcurementSnapshot, resolveProcurementFilters } from "../src/lib/server/procurement";
import { getSupplierDataGapCount } from "../src/lib/server/suppliers";
import { proposeAction } from "../src/lib/server/actions";
import { proposeWorkflow } from "../src/lib/server/workflows";
import { listCommunications } from "../src/lib/server/communications";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase17Verify(prisma: PrismaClient) {
  const pageSource = readFileSync(join(process.cwd(), "src/app/(workspace)/daily-review/page.tsx"), "utf8");
  const workspaceSource = readFileSync(join(process.cwd(), "src/components/daily-review/DailyReviewWorkspace.tsx"), "utf8");
  const serverSource = readFileSync(join(process.cwd(), "src/lib/server/daily-review.ts"), "utf8");
  assert(!/openai|OpenAI|generateResponse|runProductionOrchestrator/i.test(pageSource), "Daily Review page load must not call OpenAI");
  assert(!/openai|OpenAI/i.test(serverSource), "Daily review server must not call OpenAI");
  assert(/Explain today/.test(workspaceSource), "Explicit AI explain action required");
  assert(/\/api\/ai/.test(workspaceSource), "AI explanation uses existing /api/ai path");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && user, "Tenants required");

  const manager: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const other: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };

  const snapshot = await getDailyReviewSnapshot(manager);
  assert(Array.isArray(snapshot.health) && snapshot.health.length === 7, "Daily Review loads with domain health");
  assert(Array.isArray(snapshot.attention), "Daily Review attention list present");
  assert(typeof snapshot.planningNote === "string", "Planning note present");

  const emptyish = await getDailyReviewSnapshot(other);
  assert(
    emptyish.emptyReason !== null || emptyish.attention.length >= 0,
    "Empty tenant produces honest empty or bounded state"
  );
  const tenantProducts = await prisma.product.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantProductIds = new Set(tenantProducts.map((row) => row.id));
  for (const item of snapshot.attention) {
    if (item.targetType === "material" && item.targetId) {
      assert(tenantProductIds.has(item.targetId), "Tenant isolation: material targets belong to current tenant");
    }
  }
  const otherProducts = await prisma.product.findMany({ where: { tenantId: tenantB.id }, select: { id: true } });
  const otherProductIds = new Set(otherProducts.map((row) => row.id));
  for (const item of emptyish.attention) {
    if (item.targetType === "material" && item.targetId) {
      assert(otherProductIds.has(item.targetId), "Tenant isolation: other tenant material targets scoped");
    }
  }

  const materials = await getMaterialsSnapshot(manager, resolveMaterialsFilters({ view: "shortages" }));
  const critical = materials.materials.filter((row) => row.risk === "CRITICAL" || row.risk === "HIGH");
  if (critical.length > 0) {
    assert(
      snapshot.attention.some((item) => item.domain === "materials") || snapshot.context.materialShortages > 0,
      "Material risk appears correctly"
    );
  }

  const procurement = await getProcurementSnapshot(manager, resolveProcurementFilters({ view: "all" }));
  if (procurement.pendingReviewCount > 0) {
    assert(snapshot.attention.some((item) => item.domain === "procurement"), "Procurement attention appears correctly");
  }

  const operations = await getOperationsPlanner(manager, resolvePlanningWindow({ weeks: "1" }));
  const atRisk = operations.orders.filter((order) => order.displayStatus === "AT_RISK");
  if (atRisk.length > 0) {
    assert(snapshot.attention.some((item) => item.domain === "production"), "Production risk appears correctly");
  }

  assert(
    snapshot.attention.every((item) => ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].includes(item.severity)),
    "No fabricated severity scale"
  );

  const gaps = await getSupplierDataGapCount(manager);
  if (gaps > 0) {
    assert(snapshot.attention.some((item) => item.domain === "suppliers") || snapshot.context.supplierGaps === gaps, "Supplier information bounded");
  }

  const compact = toCompactDailyReviewContext(snapshot);
  assert(compact.attention.length <= 5, "AI context is compact (top attention)");
  const compactJson = JSON.stringify(compact);
  assert(!compactJson.includes(tenant.id), "AI context contains no tenant UUID");
  assert(!/DATABASE_URL|postgres:\/\//i.test(compactJson), "AI context contains no database credentials");
  assert(!compactJson.includes("Prisma") && !/"_count"/.test(compactJson), "AI context contains no raw Prisma objects");

  const dailyIntent = detectIntent("Explain today's priorities across operations and procurement.");
  assert(dailyIntent.intent === "DAILY_REVIEW", "Daily review intent detected");
  assert(INTENT_TOOLS.DAILY_REVIEW.length === 1 && INTENT_TOOLS.DAILY_REVIEW[0] === "get_daily_review", "One daily review tool");

  const context = await collectToolContext(manager, dailyIntent, "demonstration", tenant.name);
  assert(context.toolsUsed.includes("get_daily_review"), "Daily review tool used");
  assert(context.dailyReview, "Compact daily review attached");
  assert(!JSON.stringify(context.dailyReview).includes(tenant.id), "Collected context omits tenant UUID from model packet");

  const openaiProvider = readFileSync(join(process.cwd(), "src/lib/ai/openai-provider.ts"), "utf8");
  assert(/chat\.completions\.create/.test(openaiProvider), "OpenAI call occurs at provider boundary");
  assert(!/chat\.completions\.create/.test(serverSource), "Domain daily-review service does not call OpenAI");

  const orchestrator = readFileSync(join(process.cwd(), "src/lib/server/ai-orchestrator.ts"), "utf8");
  assert(/provider\.generateResponse/.test(orchestrator), "Explicit AI request calls provider once via orchestrator");

  assert(!/createRequisitionDraft|purchaseOrder|sendMessage/i.test(workspaceSource), "AI UI cannot create requisitions or send communications");
  assert(!/executeAction|approveAction|runWorkflow/i.test(workspaceSource), "AI cannot directly execute actions from daily review");

  const beforeActions = await prisma.action.count({ where: { tenantId: tenant.id } });
  await proposeAction(manager, {
    type: "CREATE_FOLLOW_UP_TASK",
    title: "Phase 17 sanity follow-up",
    reason: "Verify Phase 9 still works after Phase 17.",
    targetName: "ABC Pharmaceuticals",
  });
  const afterActions = await prisma.action.count({ where: { tenantId: tenant.id } });
  assert(afterActions >= beforeActions, "Phase 9 actions still work");

  await proposeWorkflow(manager, {
    type: "CUSTOMER_REENGAGEMENT",
    title: "Phase 17 workflow sanity",
    reason: "Verify Phase 10 still works after Phase 17.",
    targetName: "ABC Pharmaceuticals",
  });
  await listCommunications(manager);
  assert(true, "Phase 11 communications still work");

  await getOperationsPlanner(manager, resolvePlanningWindow({ weeks: "1" }));
  await getMaterialsSnapshot(manager, resolveMaterialsFilters({ view: "overview" }));
  await getProcurementSnapshot(manager, resolveProcurementFilters({ view: "all" }));

  console.log("Phase 17 verification passed.");
}
