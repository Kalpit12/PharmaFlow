import type { SupplierCandidate, SupplierRecommendation } from "@/lib/suppliers/types";

function candidateRank(row: SupplierCandidate): number {
  let score = 0;
  if (row.preferred) score += 1000;
  if (row.leadTimeDays !== null) score += Math.max(0, 365 - row.leadTimeDays);
  if (row.unitPrice !== null) score += Math.max(0, 500 - row.unitPrice);
  if (row.status === "ACTIVE") score += 100;
  return score;
}

export function compareSupplierCandidates(candidates: SupplierCandidate[]): SupplierCandidate[] {
  return [...candidates].sort((a, b) => candidateRank(b) - candidateRank(a) || a.supplierName.localeCompare(b.supplierName));
}

export function recommendSupplier(candidates: SupplierCandidate[]): SupplierRecommendation {
  const ranked = compareSupplierCandidates(candidates).filter((row) => row.status === "ACTIVE");
  if (ranked.length === 0) {
    return {
      supplierId: null,
      title: "Supplier recommendation unavailable",
      reason: "Historical supplier data is insufficient.",
      confidence: "limited-data",
    };
  }

  const top = ranked[0];
  const hasLeadTime = top.leadTimeDays !== null;
  const hasPrice = top.unitPrice !== null;
  const hasComparable = ranked.some((row) => row.supplierId !== top.supplierId && (row.leadTimeDays !== null || row.unitPrice !== null));
  if (!hasComparable) {
    return {
      supplierId: null,
      title: "Supplier recommendation unavailable",
      reason: "Historical supplier data is insufficient.",
      confidence: "limited-data",
    };
  }

  if (top.preferred && hasLeadTime) {
    return {
      supplierId: top.supplierId,
      title: "Recommended supplier",
      reason: "Preferred supplier with the shortest known lead time among available options.",
      confidence: "verified-data",
    };
  }

  if (hasLeadTime) {
    return {
      supplierId: top.supplierId,
      title: "Recommended supplier",
      reason: "Recommended based on the shortest known lead time from available supplier records.",
      confidence: "verified-data",
    };
  }

  if (hasPrice) {
    return {
      supplierId: top.supplierId,
      title: "Recommended supplier",
      reason: "Recommended based on the best known unit price among available supplier records.",
      confidence: "verified-data",
    };
  }

  return {
    supplierId: null,
    title: "Supplier recommendation unavailable",
    reason: "Historical supplier data is insufficient.",
    confidence: "limited-data",
  };
}
