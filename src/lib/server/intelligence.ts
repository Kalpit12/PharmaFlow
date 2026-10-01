import { can } from "@/lib/auth/authorization";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { collectOperationalFacts, type IntelligenceFactSources } from "@/lib/intelligence/facts";
import { buildOperationalInsights } from "@/lib/intelligence/insights";
import { bandPriorities, rankOperationalPriorities } from "@/lib/intelligence/priorities";
import type {
  CompactIntelligenceContext,
  IntelligenceDomain,
  IntelligenceSnapshot,
  OperationalChange,
  OperationalFact,
} from "@/lib/intelligence/types";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { getBatchesSnapshot } from "@/lib/server/batches";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { getOperationsPlanner, resolvePlanningWindow } from "@/lib/server/operations";
import { getProcurementSnapshot, resolveProcurementFilters } from "@/lib/server/procurement";
import { countProcurementRfqsAwaitingEvaluation } from "@/lib/server/procurement-rfqs";
import { countPendingPurchaseOrders } from "@/lib/server/purchase-orders";
import { getQualitySnapshot, resolveQualityFilters } from "@/lib/server/quality";
import { countAwaitingReceipt } from "@/lib/server/receiving";
import { getSupplierPerformanceSnapshot } from "@/lib/server/supplier-performance";
import { getTraceabilityAttention } from "@/lib/server/traceability";

const DOMAIN_PERMISSION: Record<IntelligenceDomain, Permission> = {
  production: "production.read",
  materials: "materials.read",
  procurement: "procurement.read",
  suppliers: "suppliers.read",
  batches: "batches.read",
  quality: "quality.read",
  traceability: "traceability.read",
  commercial: "sales.read",
};

export function permittedIntelligenceDomains(role: string | null): IntelligenceDomain[] {
  return (Object.keys(DOMAIN_PERMISSION) as IntelligenceDomain[]).filter((domain) =>
    hasPermission(role, DOMAIN_PERMISSION[domain])
  );
}

export function emptyIntelligenceSnapshot(excludedDomains: IntelligenceDomain[] = []): IntelligenceSnapshot {
  return buildIntelligenceSnapshotFromSources({}, [], excludedDomains);
}

export function buildIntelligenceSnapshotFromSources(
  sources: IntelligenceFactSources,
  changes: OperationalChange[],
  excludedDomains: IntelligenceDomain[]
): IntelligenceSnapshot {
  const facts = collectOperationalFacts(sources).filter((fact) => !excludedDomains.includes(fact.domain));
  const insights = buildOperationalInsights(facts);
  const priorities = rankOperationalPriorities(insights);
  const changeNote =
    changes.length > 0
      ? `${changes.length} recent sensitive mutation${changes.length === 1 ? "" : "s"} from the audit trail.`
      : "Change history is insufficient.";
  return {
    generatedAt: new Date().toISOString(),
    openaiCallsOnLoad: 0,
    facts,
    insights,
    priorities,
    bands: bandPriorities(priorities),
    changes,
    changeNote,
    excludedDomains,
    disclaimer: "Deterministic operational intelligence from recorded workspace facts. No model calls on page load.",
  };
}

export async function getIntelligenceSnapshot(ctx: TenantContext): Promise<IntelligenceSnapshot> {
  const permitted = permittedIntelligenceDomains(ctx.role);
  const excluded = (Object.keys(DOMAIN_PERMISSION) as IntelligenceDomain[]).filter((domain) => !permitted.includes(domain));
  const sources: IntelligenceFactSources = {};

  const loaders: Array<Promise<void>> = [];

  if (permitted.includes("production")) {
    loaders.push(
      getOperationsPlanner(ctx, resolvePlanningWindow({ weeks: "1" }))
        .then((operations) => {
          sources.productionOrders = operations.orders.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            productName: order.productName,
            displayStatus: order.displayStatus,
            dueDate: order.dueDate,
            materialReadiness: order.materialReadiness,
            materialShortageCount: order.materialShortageCount,
            materialAffected: order.materialAffected,
            capacityState: order.capacityState,
            conflictCount: order.conflictCount,
            priority: order.priority,
          }));
          sources.workstations = operations.workstations.map((row) => ({
            id: row.id,
            name: row.name,
            utilization: row.utilization,
            capacityState: row.capacityState,
          }));
        })
        .catch(() => undefined)
        .then(() => undefined)
    );
  }

  if (permitted.includes("materials")) {
    loaders.push(
      getMaterialsSnapshot(ctx, resolveMaterialsFilters({ view: "shortages" }))
        .then((materials) => {
          sources.materials = materials.materials.map((row) => ({
            productId: row.productId,
            sku: row.sku,
            name: row.name,
            shortage: row.shortage,
            shortageStatus: row.shortageStatus,
            risk: row.risk,
            netRequirement: row.netRequirement,
            projectedAvailable: row.projectedAvailable,
            grossRequirement: row.grossRequirement,
            earliestShortageDate: row.earliestShortageDate,
            affectedOrders: row.affectedOrders.map((order) => ({
              id: order.id,
              orderNumber: order.orderNumber,
              productName: order.productName,
            })),
          }));
        })
        .catch(() => undefined)
        .then(() => undefined)
    );
  }

  if (permitted.includes("procurement")) {
    loaders.push(
      Promise.all([
        getProcurementSnapshot(ctx, resolveProcurementFilters({ view: "needs-review" })).catch(() => null),
        countProcurementRfqsAwaitingEvaluation(ctx).catch(() => 0),
        countPendingPurchaseOrders(ctx).catch(() => 0),
        countAwaitingReceipt(ctx).catch(() => 0),
      ]).then(([procurement, awaitingEvaluation, pendingPurchaseOrders, awaitingReceipt]) => {
        sources.procurement = {
          pendingReview: procurement?.pendingReviewCount ?? 0,
          awaitingEvaluation,
          pendingPurchaseOrders,
          awaitingReceipt,
        };
      })
    );
  }

  if (permitted.includes("suppliers")) {
    loaders.push(
      getSupplierPerformanceSnapshot(ctx, { view: "attention" })
        .then((snapshot) => {
          sources.suppliers = snapshot.rows.slice(0, 12).map((row) => ({
            supplierId: row.supplierId,
            name: row.name,
            band: row.band,
            attentionFlags: row.attentionFlags,
            poCount: row.poCount,
          }));
        })
        .catch(() => undefined)
        .then(() => undefined)
    );
  }

  if (permitted.includes("quality")) {
    loaders.push(
      getQualitySnapshot(ctx, resolveQualityFilters({ view: "open" }))
        .then((quality) => {
          sources.qualityExceptions = quality.exceptions.map((row) => ({
            id: row.id,
            reference: row.reference,
            title: row.title,
            severity: row.severity,
            status: row.status,
            dueState: row.dueState,
            ownerName: row.ownerName,
            entityLabel: row.entity.entityLabel,
            batchId: row.entity.batchId,
            batchNumber: row.entity.batchNumber,
            batchQualityStatus: row.entity.batchQualityStatus,
          }));
        })
        .catch(() => undefined)
        .then(() => undefined)
    );
  }

  if (permitted.includes("batches")) {
    loaders.push(
      getBatchesSnapshot(ctx, { view: "all" })
        .then((batches) => {
          sources.batches = batches.batches.map((row) => ({
            id: row.id,
            batchNumber: row.batchNumber,
            productName: row.productName,
            qualityStatus: row.qualityStatus,
            manufacturingStatus: row.manufacturingStatus,
            holdReason: row.holdReason,
            orderNumber: row.orderNumber,
          }));
        })
        .catch(() => undefined)
        .then(() => undefined)
    );
  }

  if (permitted.includes("traceability")) {
    loaders.push(
      getTraceabilityAttention(ctx)
        .then((rows) => {
          sources.traceability = rows.map((row) => ({
            id: row.id,
            severity: row.severity,
            title: row.title,
            detail: row.detail,
            href: row.href,
          }));
        })
        .catch(() => undefined)
        .then(() => undefined)
    );
  }

  await Promise.all(loaders);

  const changes = can(ctx.role, "audit.read") ? await loadRecentChanges(ctx) : [];
  return buildIntelligenceSnapshotFromSources(sources, changes, excluded);
}

async function loadRecentChanges(ctx: TenantContext): Promise<OperationalChange[]> {
  const rows = await getPrisma().auditLog.findMany({
    where: { tenantId: ctx.tenantId },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return rows.map((row) => ({
    id: row.id,
    at: row.createdAt.toISOString(),
    actor: row.actor?.name ?? "Unknown",
    action: row.action,
    entityType: row.entityType,
    summary: [row.oldValue, row.newValue].filter(Boolean).join(" → ") || row.action,
    confidence: "KNOWN" as const,
  }));
}

export function toCompactIntelligenceContext(
  snapshot: IntelligenceSnapshot,
  question: string,
  priorityId?: string
): CompactIntelligenceContext {
  const excluded = new Set(snapshot.excludedDomains);
  const focus = priorityId ? snapshot.priorities.filter((row) => row.id === priorityId) : snapshot.priorities.slice(0, 8);
  const factsFor = (domain: IntelligenceDomain) => {
    if (excluded.has(domain)) return [];
    return snapshot.facts
      .filter((fact) => fact.domain === domain || fact.relatedDomains.includes(domain))
      .slice(0, 6)
      .map(compactFact);
  };

  return {
    question: question.slice(0, 400),
    priorities: focus.map((row) => ({
      rank: row.rank,
      band: row.band,
      title: row.title,
      reason: row.reason,
      impact: row.impact,
      domain: row.domain,
      related: row.relatedDomains,
      confidence: row.confidence,
    })),
    production: factsFor("production"),
    materials: factsFor("materials"),
    procurement: [...factsFor("procurement"), ...factsFor("suppliers")],
    quality: [...factsFor("quality"), ...factsFor("batches")],
    traceability: factsFor("traceability"),
    commercial: factsFor("commercial"),
    changes: snapshot.changes.slice(0, 8).map((row) => ({ action: row.action, summary: row.summary })),
    excludedDomains: snapshot.excludedDomains,
    changeNote: snapshot.changeNote,
  };
}

function compactFact(fact: OperationalFact) {
  return {
    title: fact.title,
    reason: fact.reason,
    evidence: fact.evidence.map((row) => `${row.label}: ${row.value}`),
  };
}

const FORBIDDEN_CONTEXT_KEYS = ["tenantId", "password", "passwordHash", "DATABASE_URL", "token", "email"];

export function sanitizeIntelligenceContext(context: CompactIntelligenceContext): CompactIntelligenceContext {
  const json = JSON.stringify(context);
  for (const key of FORBIDDEN_CONTEXT_KEYS) {
    if (new RegExp(`"${key}"\\s*:`, "i").test(json)) {
      throw new Error("Intelligence context contained a forbidden field.");
    }
  }
  if (/postgres:\/\//i.test(json) || /DATABASE_URL/i.test(json)) {
    throw new Error("Intelligence context contained a connection string.");
  }
  return context;
}

export function intelligenceContextHasForbiddenFields(context: unknown): boolean {
  const json = JSON.stringify(context);
  return FORBIDDEN_CONTEXT_KEYS.some((key) => new RegExp(`"${key}"\\s*:`, "i").test(json));
}
