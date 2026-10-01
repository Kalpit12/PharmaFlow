import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { canReleaseBatch } from "../src/lib/batches/service";
import { parseIntelligenceExplanation } from "../src/lib/ai/intelligence-explain";
import { collectOperationalFacts, type IntelligenceFactSources } from "../src/lib/intelligence/facts";
import { buildOperationalInsights } from "../src/lib/intelligence/insights";
import { fallbackExplanation, rankOperationalPriorities } from "../src/lib/intelligence/priorities";
import { computeMaterialRequirements } from "../src/lib/materials/requirements";
import { computeOrderMaterialReadiness } from "../src/lib/operations/planning";
import { canTransitionQualityStatus } from "../src/lib/quality/service";
import { hasPermission } from "../src/lib/auth/permissions";
import { can, canApprove } from "../src/lib/auth/authorization";
import {
  buildIntelligenceSnapshotFromSources,
  getIntelligenceSnapshot,
  intelligenceContextHasForbiddenFields,
  permittedIntelligenceDomains,
  toCompactIntelligenceContext,
} from "../src/lib/server/intelligence";
import type { TenantContext } from "../src/lib/server/errors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sampleSources(): IntelligenceFactSources {
  return {
    productionOrders: [
      {
        id: "po-1",
        orderNumber: "PO-104",
        productName: "Amoxicillin 500mg",
        displayStatus: "AT_RISK",
        dueDate: "2026-09-20T00:00:00.000Z",
        materialReadiness: "SHORTAGE",
        materialShortageCount: 1,
        materialAffected: ["Amoxicillin API"],
        capacityState: "WARNING",
        conflictCount: 0,
        priority: "HIGH",
      },
    ],
    workstations: [{ id: "ws-a", name: "Workstation A", utilization: 97, capacityState: "DANGER" }],
    materials: [
      {
        productId: "api-1",
        sku: "API-AMX",
        name: "Amoxicillin API",
        shortage: true,
        shortageStatus: "SHORTAGE",
        risk: "CRITICAL",
        netRequirement: 120,
        projectedAvailable: -40,
        grossRequirement: 200,
        earliestShortageDate: "2026-09-18T00:00:00.000Z",
        affectedOrders: [{ id: "po-1", orderNumber: "PO-104", productName: "Amoxicillin 500mg" }],
      },
    ],
    procurement: { pendingReview: 2, awaitingEvaluation: 1, pendingPurchaseOrders: 1, awaitingReceipt: 1 },
    suppliers: [{ supplierId: "sup-1", name: "Supplier X", band: "RISK", attentionFlags: ["Receiving discrepancy rate is elevated"], poCount: 3 }],
    qualityExceptions: [
      {
        id: "q-1",
        reference: "Q-2026-018",
        title: "Assay out of trend",
        severity: "HIGH",
        status: "INVESTIGATING",
        dueState: "OVERDUE",
        ownerName: null,
        entityLabel: "B-2026-014",
        batchId: "b-1",
        batchNumber: "B-2026-014",
        batchQualityStatus: "ON_HOLD",
      },
    ],
    batches: [
      {
        id: "b-1",
        batchNumber: "B-2026-014",
        productName: "Amoxicillin 500mg",
        qualityStatus: "ON_HOLD",
        manufacturingStatus: "COMPLETED",
        holdReason: "Awaiting laboratory result",
        orderNumber: "PO-104",
      },
    ],
    traceability: [
      {
        id: "t-1",
        severity: "HIGH",
        title: "Potential customer impact from finished product match",
        detail: "Sales orders matched by product, not batch allocation.",
        href: "/traceability",
      },
    ],
  };
}

export async function runPhase37Verify(prisma: PrismaClient) {
  const sources = [
    "src/lib/intelligence/facts.ts",
    "src/lib/intelligence/insights.ts",
    "src/lib/intelligence/priorities.ts",
    "src/lib/server/intelligence.ts",
    "src/lib/server/command-center.ts",
    "src/lib/server/daily-review.ts",
    "src/lib/server/reports.ts",
    "src/components/command-center/CommandCenterWorkspace.tsx",
    "src/components/daily-review/DailyReviewWorkspace.tsx",
    "src/components/reports/ReportingWorkspace.tsx",
  ]
    .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
    .join("\n");
  assert(
    !/from ["']openai["']|new OpenAI|chat\.completions|OPENAI_API_KEY/.test(sources),
    "Phase 37 page-load surfaces perform ZERO OpenAI calls"
  );
  assert(!sources.includes("runProductionOrchestrator"), "Command Center / Daily Review / Reports do not call the mutating AI orchestrator");

  const facts = collectOperationalFacts(sampleSources());
  assert(facts.some((row) => row.type === "PRODUCTION_RISK"), "Production risk facts");
  assert(facts.some((row) => row.type === "MATERIAL_SHORTAGE"), "Material shortage facts");
  assert(facts.some((row) => row.type === "PROCUREMENT_RISK"), "Procurement risk facts");
  assert(facts.some((row) => row.type === "QUALITY_IMPACT"), "Quality impact facts");
  assert(facts.some((row) => row.type === "TRACEABILITY_IMPACT" || row.type === "CUSTOMER_IMPACT"), "Traceability / customer impact");
  assert(facts.some((row) => row.type === "CAPACITY_RISK"), "Capacity risk facts");
  assert(facts.every((row) => row.reason.length > 12), "Facts include a specific reason");

  const shortage = facts.find((row) => row.type === "MATERIAL_SHORTAGE")!;
  assert(shortage.relatedDomains.includes("production"), "Cross-domain material → production");
  assert(shortage.confidence === "KNOWN", "MRP shortage is known");

  const customer = facts.find((row) => row.type === "CUSTOMER_IMPACT" || row.type === "TRACEABILITY_IMPACT")!;
  assert(customer.confidence === "PARTIAL" || customer.confidence === "INSUFFICIENT_DATA", "Customer impact is not overstated");

  const empty = collectOperationalFacts({});
  assert(empty.length === 0, "No invented facts");

  const insights = buildOperationalInsights(facts);
  assert(insights.some((row) => /projected available/i.test(row.why) || /below gross/i.test(row.why)), "Insights explain why");
  assert(insights.every((row) => row.impact.length > 8 && row.source.length > 0), "Insights include impact and source");

  const priorities = rankOperationalPriorities(insights);
  assert(priorities[0]!.rank === 1, "Priorities are ranked");
  assert(priorities[0]!.score >= priorities[priorities.length - 1]!.score, "Priority scores descend");
  assert(priorities[0]!.scoreReasons.length > 0, "Priority ranking reasons exposed");

  const snapshot = buildIntelligenceSnapshotFromSources(sampleSources(), [], ["commercial"]);
  assert(snapshot.openaiCallsOnLoad === 0, "Snapshot records zero OpenAI calls on load");
  assert(snapshot.changeNote.includes("insufficient"), "Insufficient change history is disclosed");
  assert(snapshot.excludedDomains.includes("commercial"), "Excluded domains recorded");

  const context = toCompactIntelligenceContext(snapshot, "Why is production at risk?");
  assert(!intelligenceContextHasForbiddenFields(context), "AI context omits tenant IDs and secrets");
  assert(!("tenantId" in context), "Compact context has no tenantId");
  assert(context.question === "Why is production at risk?", "Question passed through");
  assert(context.priorities.length > 0, "Context includes priorities");
  assert(context.excludedDomains.includes("commercial"), "Context is permission-aware");
  assert(context.commercial.length === 0, "Excluded commercial domain omitted from AI context");

  const parsed = parseIntelligenceExplanation({
    summary: "Production is at risk because MRP shows a shortage.",
    reasons: ["Amoxicillin API projected available is below gross requirement."],
    impacts: ["PO-104 depends on the short material."],
    reviewItems: ["Open materials workspace"],
    limitations: ["Batch-level customer allocation is not recorded."],
  });
  assert(parsed?.source === "openai" && parsed.reasons.length === 1, "AI response schema accepted");
  assert(parseIntelligenceExplanation({ summary: "" }) === null, "Empty AI summary rejected");

  const fallback = fallbackExplanation(priorities, "What should management look at?");
  assert(fallback.source === "deterministic" && fallback.summary.length > 0, "AI failure fallback is deterministic");

  assert(permittedIntelligenceDomains("VIEWER").includes("production"), "Viewer can read production intelligence");
  assert(permittedIntelligenceDomains("VIEWER").includes("commercial"), "Viewer commercial read is sales.read");
  assert(!permittedIntelligenceDomains("QUALITY").includes("procurement"), "Quality role excludes procurement intelligence");
  assert(permittedIntelligenceDomains("QUALITY").includes("quality"), "Quality role includes quality intelligence");
  const qualityOnly = buildIntelligenceSnapshotFromSources(sampleSources(), [], ["procurement", "suppliers", "commercial"]);
  const qualityContext = toCompactIntelligenceContext(qualityOnly, "What should management look at?");
  assert(qualityContext.procurement.length === 0, "Quality role AI context excludes procurement");
  assert(qualityContext.commercial.length === 0, "Quality role AI context excludes commercial");
  assert(qualityOnly.priorities.every((row) => row.domain !== "procurement"), "Quality snapshot omits procurement-domain priorities");
  assert(hasPermission("VIEWER", "quality.read") && !hasPermission("VIEWER", "quality.manage"), "Phase 36 viewer regression");
  assert(canApprove("MANAGER") && !can("VIEWER", "batches.quality_action"), "Phase 36 authorization regression");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "lab-allied" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && tenantB && user, "Demo tenants exist");
  const ctxA: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const ctxB: TenantContext = { tenantId: tenantB.id, userId: user.id, role: "MANAGER" };

  const live = await getIntelligenceSnapshot(ctxA);
  assert(live.openaiCallsOnLoad === 0, "Live snapshot does not call OpenAI");
  const other = await getIntelligenceSnapshot(ctxB);
  const aIds = new Set(live.facts.map((row) => row.entityId).filter(Boolean));
  const leaked = other.facts.some((row) => row.entityId && aIds.has(row.entityId) && row.entityType === "QUALITY_EXCEPTION");
  assert(!leaked || live.facts.length === 0 || other.facts.length === 0, "Tenant isolation on intelligence facts");

  assert(canReleaseBatch({ qualityStatus: "ON_HOLD", manufacturingStatus: "COMPLETED", productionCompleted: true }), "Phase 33 regression: hold can be released");
  assert(!canReleaseBatch({ qualityStatus: "RELEASED", manufacturingStatus: "COMPLETED", productionCompleted: true }), "Phase 33 regression: released cannot re-release");
  assert(canTransitionQualityStatus("OPEN", "INVESTIGATING") && !canTransitionQualityStatus("CLOSED", "OPEN"), "Phase 35 regression");
  const requirements = computeMaterialRequirements({
    orders: [
      {
        id: "po-1",
        orderNumber: "PO-1",
        productId: "fg",
        productName: "Finished",
        quantity: 1000,
        dueDate: "2026-03-01T00:00:00.000Z",
        priority: "NORMAL",
        status: "SCHEDULED",
        plannedStart: "2026-03-01T08:00:00.000Z",
        plannedEnd: "2026-03-01T16:00:00.000Z",
      },
    ],
    boms: [{ productId: "fg", componentId: "api", quantityPer: 0.01 }],
    identities: [
      { id: "api", sku: "API", name: "API", unit: "kg", safetyStock: 0 },
      { id: "fg", sku: "FG", name: "Finished", unit: "unit", safetyStock: 0 },
    ],
    lots: [{ productId: "api", batchCode: "API-LOT", quantity: 800, expiryDate: "2027-01-01T00:00:00.000Z", warehouseName: "RM" }],
    receipts: [],
  });
  assert(requirements.some((row) => row.sku === "API"), "Phase 32 regression");
  assert(computeOrderMaterialReadiness(requirements, "po-1", true).state !== undefined, "Phase 31 regression");

  const explainSource = readFileSync(join(process.cwd(), "src/lib/ai/intelligence-explain.ts"), "utf8");
  assert(explainSource.includes("chat.completions.create"), "Explicit explain may use one OpenAI call");
  assert(!explainSource.includes("proposeAction") && !explainSource.includes("proposeCommunication"), "AI explain cannot mutate");

  console.log("Phase 37 verification passed.");
}
