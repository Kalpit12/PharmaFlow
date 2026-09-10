import {
  IMMINENT_DUE_DAYS,
  OPEN_PRODUCTION_STATUSES,
  TIGHT_COVERAGE_RATIO,
  type MaterialBomLine,
  type MaterialCoverageStatus,
  type MaterialIdentity,
  type MaterialLotInput,
  type MaterialOrderInput,
  type MaterialReceiptInput,
  type MaterialRequirement,
  type MaterialRisk,
  type ProductionPriorityId,
} from "@/lib/materials/types";

const DAY_MS = 86_400_000;

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
  if (input.grossRequirement > 0 && input.projectedAvailable >= 0 && input.projectedAvailable < input.grossRequirement * TIGHT_COVERAGE_RATIO) {
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
  if (input.grossRequirement > 0 && input.projectedAvailable < input.grossRequirement * TIGHT_COVERAGE_RATIO) return "TIGHT";
  return "COVERED";
}

export function computeMaterialRequirements(input: {
  orders: MaterialOrderInput[];
  boms: MaterialBomLine[];
  identities: MaterialIdentity[];
  lots: MaterialLotInput[];
  receipts: MaterialReceiptInput[];
  now?: Date;
}): MaterialRequirement[] {
  const now = input.now ?? new Date();
  const openOrders = input.orders.filter((order) => isOpenProductionStatus(order.status));
  const bomByProduct = new Map<string, MaterialBomLine[]>();
  for (const line of input.boms) {
    const list = bomByProduct.get(line.productId) ?? [];
    list.push(line);
    bomByProduct.set(line.productId, list);
  }

  const identityById = new Map(input.identities.map((row) => [row.id, row]));
  const available = new Map<string, number>();
  const lotsByMaterial = new Map<string, MaterialRequirement["lots"]>();
  for (const lot of input.lots) {
    const usable = isUsableLot(lot.expiryDate, now);
    if (usable) available.set(lot.productId, roundQty((available.get(lot.productId) ?? 0) + lot.quantity));
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

  const incoming = new Map<string, number>();
  for (const receipt of input.receipts) {
    incoming.set(receipt.productId, roundQty((incoming.get(receipt.productId) ?? 0) + receipt.quantity));
  }

  type Acc = {
    identity: MaterialIdentity;
    gross: number;
    orders: MaterialRequirement["affectedOrders"];
  };
  const byMaterial = new Map<string, Acc>();

  for (const order of openOrders) {
    const lines = bomByProduct.get(order.productId) ?? [];
    for (const line of lines) {
      const requiredQuantity = roundQty(order.quantity * line.quantityPer);
      const identity = identityById.get(line.componentId) ?? {
        id: line.componentId,
        sku: "UNKNOWN",
        name: "Unknown material",
        unit: "unit",
        safetyStock: 0,
      };
      const current = byMaterial.get(line.componentId) ?? { identity, gross: 0, orders: [] };
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
      byMaterial.set(line.componentId, current);
    }
  }

  const rows: MaterialRequirement[] = [];
  for (const [productId, acc] of byMaterial.entries()) {
    const onHand = available.get(productId) ?? 0;
    const inbound = incoming.get(productId) ?? 0;
    const projectedAvailable = roundQty(onHand + inbound - acc.gross);
    const netRequirement = roundQty(Math.max(0, acc.gross - onHand - inbound));
    const shortage = projectedAvailable < 0;
    const shortagePercent = acc.gross > 0 ? roundQty((netRequirement / acc.gross) * 100) : 0;
    const earliestDueDate =
      acc.orders
        .map((order) => order.dueDate)
        .sort((a, b) => a.localeCompare(b))[0] ?? null;
    const risk = classifyMaterialRisk({
      shortage,
      available: onHand,
      incoming: inbound,
      grossRequirement: acc.gross,
      projectedAvailable,
      affectedPriorities: acc.orders.map((order) => order.priority),
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
    rows.push({
      productId,
      sku: acc.identity.sku,
      name: acc.identity.name,
      unit: acc.identity.unit,
      safetyStock: acc.identity.safetyStock,
      grossRequirement: acc.gross,
      available: onHand,
      incoming: inbound,
      projectedAvailable,
      netRequirement,
      shortage,
      shortagePercent,
      affectedOrders: acc.orders.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
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
  return rows.sort(
    (a, b) => rank[b.risk] - rank[a.risk] || a.earliestDueDate?.localeCompare(b.earliestDueDate ?? "") || a.sku.localeCompare(b.sku)
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
