import { IMMINENT_DUE_DAYS, type MaterialRequirement, type MaterialRisk } from "@/lib/materials/types";
import type { ProcurementRecommendation, ProcurementRowStatus } from "@/lib/procurement/types";

/** Risks that generate procurement recommendations (not automatic drafts). */
export const PROCUREMENT_RECOMMENDATION_RISKS: MaterialRisk[] = ["CRITICAL", "HIGH", "MEDIUM"];

export function isProcurementRecommendation(material: MaterialRequirement): boolean {
  return PROCUREMENT_RECOMMENDATION_RISKS.includes(material.risk) && material.netRequirement > 0;
}

export function isProcurementMonitor(material: MaterialRequirement): boolean {
  return material.risk === "LOW";
}

export function suggestedProcurementQuantity(material: MaterialRequirement): number {
  return Math.max(0, material.netRequirement);
}

export function procurementRecommendationReason(material: MaterialRequirement): string {
  const orderCount = material.affectedOrders.length;
  const orderLabel = `${orderCount} production order${orderCount === 1 ? "" : "s"}`;

  if (material.shortage && material.risk === "CRITICAL") {
    const elevated = material.affectedOrders.some((order) => order.priority === "HIGH" || order.priority === "CRITICAL");
    const dueSoon =
      material.earliestDueDate &&
      (new Date(material.earliestDueDate).getTime() - Date.now()) / 86_400_000 <= IMMINENT_DUE_DAYS;
    if (elevated && dueSoon) {
      return "Critical material shortage affects a high-priority production order with an imminent due date.";
    }
  }

  if (material.shortage) {
    return `Projected material shortage affects ${orderLabel}. Current inventory and incoming receipts do not cover production demand.`;
  }

  if (material.status === "INCOMING_COVERS") {
    return "On-hand stock is below gross requirement; open inbound is expected to cover the gap, but procurement attention is advised.";
  }

  return `Material requirement for ${orderLabel} exceeds usable stock after inbound receipts.`;
}

type RequisitionLookup = {
  id: string;
  status: ProcurementRowStatus;
  createdByName: string | null;
  createdAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
};

export function buildProcurementRecommendations(
  materials: MaterialRequirement[],
  requisitions: Map<string, RequisitionLookup>
): ProcurementRecommendation[] {
  const rows: ProcurementRecommendation[] = [];

  for (const material of materials) {
    const eligible = isProcurementRecommendation(material);
    const monitor = isProcurementMonitor(material);
    if (!eligible && !monitor) continue;

    const req = requisitions.get(material.productId);
    const rowStatus: ProcurementRowStatus = req?.status ?? (monitor ? "MONITOR" : "RECOMMENDATION");

    rows.push({
      productId: material.productId,
      sku: material.sku,
      name: material.name,
      unit: material.unit,
      risk: material.risk,
      grossRequirement: material.grossRequirement,
      available: material.available,
      incoming: material.incoming,
      projectedAvailable: material.projectedAvailable,
      netRequirement: material.netRequirement,
      shortage: material.shortage,
      suggestedQuantity: suggestedProcurementQuantity(material),
      affectedOrders: material.affectedOrders,
      earliestDueDate: material.earliestDueDate,
      reason: procurementRecommendationReason(material),
      rowStatus,
      requisitionId: req?.id ?? null,
      createdByName: req?.createdByName ?? null,
      createdAt: req?.createdAt ?? null,
      reviewedByName: req?.reviewedByName ?? null,
      reviewedAt: req?.reviewedAt ?? null,
    });
  }

  const rank: Record<MaterialRisk, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, OK: 0 };
  return rows.sort(
    (a, b) =>
      rank[b.risk] - rank[a.risk] ||
      (a.earliestDueDate ?? "9999").localeCompare(b.earliestDueDate ?? "9999") ||
      a.sku.localeCompare(b.sku)
  );
}
