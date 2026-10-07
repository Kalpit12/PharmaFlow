import { explodeOrderDemand } from "@/lib/materials/mrp";
import { buildMaterialPriority, computeShortageTimeline } from "@/lib/materials/shortages";
import {
  IMMINENT_DUE_DAYS,
  OPEN_PRODUCTION_STATUSES,
  type MaterialBomLine,
  type MaterialCoverageStatus,
  type MaterialDemandSource,
  type MaterialIdentity,
  type MaterialLotInput,
  type MaterialOrderInput,
  type MaterialReceiptInput,
  type MaterialRequirement,
  type MaterialRisk,
  type ProductionPriorityId,
  type ProcurementLinkage,
} from "@/lib/materials/types";

const DAY_MS = 86_400_000;

const EMPTY_PROCUREMENT: ProcurementLinkage = {
  openRequisitions: 0,
  openRfqs: 0,
  openPurchaseOrders: 0,
  hrefProcurement: "/procurement",
  hrefRfqs: "/rfqs",
  hrefPurchaseOrders: "/purchase-orders",
};

export function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function isOpenProductionStatus(status: string): boolean {
  return (OPEN_PRODUCTION_STATUSES as readonly string[]).includes(status);
}

export function isUsableLot(expiryDate: string | null, now: Date): boolean {
  if (!expiryDate) return true;
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return true;
  return expiry.getTime() >= now.getTime();
}

function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  return Math.floor((due.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Urgency is due-date proximity for the earliest affected order.
 * ≤0 days overdue or due today → CRITICAL
 * ≤7 days → HIGH
 * ≤14 days → MEDIUM
 * ≤30 days → LOW
 * otherwise OK
 */
export function classifyUrgency(earliestDueDate: string | null, now: Date): MaterialRisk {
  const days = daysUntil(earliestDueDate, now);
  if (days === null) return "OK";
  if (days <= 0) return "CRITICAL";
  if (days <= IMMINENT_DUE_DAYS) return "HIGH";
  if (days <= 14) return "MEDIUM";
  if (days <= 30) return "LOW";
  return "OK";
}

function isElevatedPriority(priority: ProductionPriorityId): boolean {
  return priority === "HIGH" || priority === "CRITICAL";
}

/**
 * Material risk thresholds (deterministic, no AI):
 *
 * CRITICAL — projected available < 0, an affected order is HIGH or CRITICAL,
 *            and the earliest due date is within IMMINENT_DUE_DAYS (7).
 * HIGH     — projected available < 0, and the row is not CRITICAL.
 * MEDIUM   — no confirmed shortage, but on-hand is below gross (incoming covers the gap).
 * LOW      — no shortage, on-hand covers gross, but projected available is
 *            below TIGHT_COVERAGE_RATIO (10%) of gross.
 * OK       — remaining demand is covered with a buffer of at least 10% of gross.
 */
export function classifyMaterialRisk(input: {
  shortage: boolean;
  available: number;
  incoming: number;
  grossRequirement: number;
  projectedAvailable: number;
  affectedPriorities: ProductionPriorityId[];
  earliestDueDate: string | null;
  now: Date;
}): MaterialRisk {
  const elevated = input.affectedPriorities.some(isElevatedPriority);
  const days = daysUntil(input.earliestDueDate, input.now);
  const imminent = days !== null && days <= IMMINENT_DUE_DAYS;

  if (input.shortage && elevated && imminent) return "CRITICAL";
  if (input.shortage) return "HIGH";
  if (input.grossRequirement > 0 && input.available < input.grossRequirement && input.incoming > 0 && input.projectedAvailable >= 0) {
    return "MEDIUM";
  }
  if (input.grossRequirement > 0 && input.projectedAvailable >= 0 && input.projectedAvailable < input.grossRequirement * 0.1) {
    return "LOW";
  }
  return "OK";
}

export function coverageStatus(input: {
  shortage: boolean;
  available: number;
  incoming: number;
  grossRequirement: number;
  projectedAvailable: number;
}): MaterialCoverageStatus {
  if (input.shortage) return "SHORTAGE";
  if (input.grossRequirement > 0 && input.available < input.grossRequirement && input.incoming > 0) return "INCOMING_COVERS";
  if (input.grossRequirement > 0 && input.projectedAvailable < input.grossRequirement * 0.1) return "TIGHT";
  return "COVERED";
}

export function computeMaterialRequirements(input: {
  orders: MaterialOrderInput[];
  boms: MaterialBomLine[];
  identities: MaterialIdentity[];
  lots: MaterialLotInput[];
  receipts: MaterialReceiptInput[];
  procurementByProduct?: Map<string, ProcurementLinkage>;
  now?: Date;
  /** Filled when an order BOM contains a cycle. Demand for that order is omitted, not invented. */
  bomCycles?: Array<{ orderId: string; orderNumber: string; path: string[] }>;
}): MaterialRequirement[] {
  const now = input.now ?? new Date();
  const openOrders = input.orders.filter((order) => isOpenProductionStatus(order.status));
  const identityById = new Map(input.identities.map((row) => [row.id, row]));
  const skuByProductId = new Map(input.identities.map((row) => [row.id, row.sku]));

  const onHandByProduct = new Map<string, number>();
  const lotsByMaterial = new Map<string, MaterialRequirement["lots"]>();
  for (const lot of input.lots) {
    const usable = isUsableLot(lot.expiryDate, now);
    if (usable) onHandByProduct.set(lot.productId, roundQty((onHandByProduct.get(lot.productId) ?? 0) + lot.quantity));
    const list = lotsByMaterial.get(lot.productId) ?? [];
    list.push({
      batchCode: lot.batchCode,
      quantity: lot.quantity,
      expiryDate: lot.expiryDate,
      warehouseName: lot.warehouseName,
      usable,
    });
    lotsByMaterial.set(lot.productId, list);
  }

  const incomingByProduct = new Map<string, number>();
  const incomingReceiptsByProduct = new Map<
    string,
    Array<{ quantity: number; expectedAt: string | null }>
  >();
  for (const receipt of input.receipts) {
    incomingByProduct.set(receipt.productId, roundQty((incomingByProduct.get(receipt.productId) ?? 0) + receipt.quantity));
    const receipts = incomingReceiptsByProduct.get(receipt.productId) ?? [];
    receipts.push({ quantity: receipt.quantity, expectedAt: receipt.expectedAt ?? null });
    incomingReceiptsByProduct.set(receipt.productId, receipts);
  }

  type Acc = {
    identity: MaterialIdentity;
    gross: number;
    orders: MaterialRequirement["affectedOrders"];
    demandSources: MaterialDemandSource[];
    bomPaths: MaterialRequirement["bomPaths"];
  };
  const byMaterial = new Map<string, Acc>();

  for (const order of openOrders) {
    const explosion = explodeOrderDemand(order.productId, order.quantity, input.boms, skuByProductId);
    if (!explosion.ok) {
      input.bomCycles?.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        path: explosion.cyclePath,
      });
      continue;
    }

    for (const [componentId, demand] of explosion.demands.entries()) {
      const requiredQuantity = demand.requiredQuantity;
      const identity = identityById.get(componentId) ?? {
        id: componentId,
        sku: "UNKNOWN",
        name: "Unknown material",
        unit: "unit",
        safetyStock: 0,
      };
      const current = byMaterial.get(componentId) ?? { identity, gross: 0, orders: [], demandSources: [], bomPaths: [] };
      current.gross = roundQty(current.gross + requiredQuantity);
      current.orders.push({
        id: order.id,
        orderNumber: order.orderNumber,
        productId: order.productId,
        productName: order.productName,
        quantity: order.quantity,
        requiredQuantity,
        dueDate: order.dueDate,
        priority: order.priority,
        status: order.status,
        plannedStart: order.plannedStart,
        plannedEnd: order.plannedEnd,
      });
      current.demandSources.push({
        productionOrderId: order.id,
        orderNumber: order.orderNumber,
        productName: order.productName,
        orderQuantity: order.quantity,
        requiredQuantity,
        paths: demand.paths,
      });
      for (const path of demand.paths) {
        if (!current.bomPaths.some((existing) => existing.pathProductIds.join(">") === path.pathProductIds.join(">"))) {
          current.bomPaths.push(path);
        }
      }
      byMaterial.set(componentId, current);
    }
  }

  const rows: MaterialRequirement[] = [];
  for (const [productId, acc] of byMaterial.entries()) {
    const onHand = onHandByProduct.get(productId) ?? 0;
    const inbound = incomingByProduct.get(productId) ?? 0;
    const allocated = acc.gross;
    const freeAvailable = roundQty(onHand - allocated);
    const projectedAvailable = roundQty(onHand + inbound - acc.gross);
    const netRequirement = roundQty(Math.max(0, acc.gross - onHand - inbound));
    const shortage = projectedAvailable < 0;
    const shortagePercent = acc.gross > 0 ? roundQty((netRequirement / acc.gross) * 100) : 0;
    const earliestDueDate =
      acc.orders
        .map((order) => order.dueDate)
        .sort((a, b) => a.localeCompare(b))[0] ?? null;
    const affectedOrders = acc.orders.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const risk = classifyMaterialRisk({
      shortage,
      available: onHand,
      incoming: inbound,
      grossRequirement: acc.gross,
      projectedAvailable,
      affectedPriorities: affectedOrders.map((order) => order.priority),
      earliestDueDate,
      now,
    });
    const status = coverageStatus({
      shortage,
      available: onHand,
      incoming: inbound,
      grossRequirement: acc.gross,
      projectedAvailable,
    });
    const timeline = computeShortageTimeline({
      onHand,
      incoming: inbound,
      grossRequirement: acc.gross,
      projectedAvailable,
      shortage,
      affectedOrders,
      now,
    });
    const riskRank: Record<MaterialRisk, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, OK: 0 };
    const priority = buildMaterialPriority({
      shortage,
      shortageStatus: timeline.status,
      netRequirement,
      affectedOrders,
      earliestDueDate,
      riskRank: riskRank[risk],
      now,
    });
    rows.push({
      productId,
      sku: acc.identity.sku,
      name: acc.identity.name,
      unit: acc.identity.unit,
      safetyStock: acc.identity.safetyStock,
      grossRequirement: acc.gross,
      onHand,
      available: onHand,
      allocated,
      freeAvailable,
      incoming: inbound,
      incomingReceipts: (incomingReceiptsByProduct.get(productId) ?? []).sort((a, b) =>
        (a.expectedAt ?? "").localeCompare(b.expectedAt ?? "")
      ),
      projectedAvailable,
      netRequirement,
      shortage,
      shortagePercent,
      shortageStatus: timeline.status,
      earliestShortageDate: timeline.earliestShortageDate,
      requirementDate: timeline.requirementDate,
      priorityLevel: priority.level,
      priorityReason: priority.reason,
      affectedOrders,
      demandSources: acc.demandSources,
      bomPaths: acc.bomPaths,
      procurement: input.procurementByProduct?.get(productId) ?? {
        ...EMPTY_PROCUREMENT,
        hrefProcurement: `/procurement?material=${productId}`,
        hrefRfqs: `/rfqs?material=${productId}`,
        hrefPurchaseOrders: `/purchase-orders?material=${productId}`,
      },
      earliestDueDate,
      urgency: classifyUrgency(earliestDueDate, now),
      risk,
      status,
      attention: shortage || risk === "MEDIUM" ? "Procurement attention required" : null,
      lots: lotsByMaterial.get(productId) ?? [],
      leadTime: "Not available",
      purchasePrice: "Not available",
      reorderPoint: "Not available",
    });
  }

  const rank: Record<MaterialRisk, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, OK: 0 };
  const priorityRank: Record<MaterialRequirement["priorityLevel"], number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };
  return rows.sort(
    (a, b) =>
      priorityRank[b.priorityLevel] - priorityRank[a.priorityLevel] ||
      rank[b.risk] - rank[a.risk] ||
      a.earliestDueDate?.localeCompare(b.earliestDueDate ?? "") ||
      a.sku.localeCompare(b.sku)
  );
}

export function orderIdsAtMaterialRisk(rows: MaterialRequirement[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.shortage) continue;
    for (const order of row.affectedOrders) ids.add(order.id);
  }
  return [...ids];
}
