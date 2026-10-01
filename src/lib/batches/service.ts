import type { BatchQualityStatus } from "@/lib/batches/types";
import type { ProductionOrderStatus } from "@prisma/client";

import type { BatchAttentionItem, BatchMaterialTraceRow, BatchQualityAction, BatchRow } from "@/lib/batches/types";

export type BatchTransitionInput = {
  qualityStatus: BatchQualityStatus;
  manufacturingStatus: ProductionOrderStatus;
  productionCompleted: boolean;
};

export function canPlaceBatchOnHold(input: BatchTransitionInput): boolean {
  return input.qualityStatus !== "RELEASED" && input.qualityStatus !== "REJECTED";
}

export function canReleaseBatch(input: BatchTransitionInput): boolean {
  return (
    (input.qualityStatus === "PENDING_REVIEW" || input.qualityStatus === "ON_HOLD") &&
    input.productionCompleted
  );
}

export function canRejectBatch(input: BatchTransitionInput): boolean {
  return canReleaseBatch(input);
}

export function validateHoldReason(reason: string | undefined | null): string | null {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 3) return "A hold reason of at least 3 characters is required.";
  if (trimmed.length > 500) return "Hold reason must be 500 characters or fewer.";
  return null;
}

export function computeBatchQuantities(input: {
  plannedQuantity: number;
  producedQuantity: number | null;
}): {
  producedLabel: string;
  remainingQuantity: number | null;
  completionPercent: number | null;
} {
  if (input.producedQuantity == null) {
    return { producedLabel: "NOT_RECORDED", remainingQuantity: null, completionPercent: null };
  }
  const remaining = Math.max(0, input.plannedQuantity - input.producedQuantity);
  const completionPercent =
    input.plannedQuantity > 0 ? Math.round((input.producedQuantity / input.plannedQuantity) * 1000) / 10 : 0;
  return {
    producedLabel: String(input.producedQuantity),
    remainingQuantity: remaining,
    completionPercent,
  };
}

export function computeBatchRisk(input: {
  qualityStatus: BatchQualityStatus;
  manufacturingStatus: ProductionOrderStatus;
  plannedQuantity: number;
  producedQuantity: number | null;
}): BatchRow["risk"] {
  if (input.qualityStatus === "REJECTED") return "CRITICAL";
  if (input.qualityStatus === "ON_HOLD" && input.manufacturingStatus === "COMPLETED") return "CRITICAL";
  if (input.qualityStatus === "PENDING_REVIEW" && input.manufacturingStatus === "COMPLETED") return "HIGH";
  if (
    input.producedQuantity != null &&
    input.plannedQuantity > 0 &&
    input.producedQuantity < input.plannedQuantity
  ) {
    return "WARNING";
  }
  if (input.qualityStatus === "ON_HOLD") return "WARNING";
  return "OK";
}

export function buildMaterialTrace(input: {
  productId: string;
  plannedQuantity: number;
  boms: Array<{ componentId: string; quantityPer: number; sku: string; name: string; unit: string }>;
  inputLots: Array<{
    productId: string;
    inventoryLot: { batchCode: string } | null;
    quantityUsed: number | null;
  }>;
}): BatchMaterialTraceRow[] {
  return input.boms.map((line) => {
    const requiredQuantity = roundQty(input.plannedQuantity * line.quantityPer);
    const lots = input.inputLots.filter((row) => row.productId === line.componentId);
    if (lots.length === 0) {
      return {
        productId: line.componentId,
        sku: line.sku,
        name: line.name,
        unit: line.unit,
        requiredQuantity,
        lotCode: "NOT_RECORDED" as const,
        quantityUsed: "NOT_RECORDED" as const,
      };
    }
    const lotCodes = lots.map((row) => row.inventoryLot?.batchCode ?? "NOT_RECORDED");
    const quantities = lots.map((row) => row.quantityUsed);
    const quantityUsed = quantities.every((value) => value != null)
      ? roundQty(quantities.reduce((sum, value) => sum + (value ?? 0), 0))
      : ("NOT_RECORDED" as const);
    return {
      productId: line.componentId,
      sku: line.sku,
      name: line.name,
      unit: line.unit,
      requiredQuantity,
      lotCode: lotCodes.join(", "),
      quantityUsed,
    };
  });
}

function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function buildBatchAttention(batches: Array<Pick<BatchRow, "id" | "batchNumber" | "qualityStatus" | "manufacturingStatus" | "holdReason" | "plannedQuantity" | "producedQuantity">>): BatchAttentionItem[] {
  const items: BatchAttentionItem[] = [];
  const onHoldCompleted = batches.filter(
    (row) => row.qualityStatus === "ON_HOLD" && row.manufacturingStatus === "COMPLETED"
  );
  if (onHoldCompleted.length === 1) {
    const row = onHoldCompleted[0]!;
    items.push({
      id: `batch-hold-${row.id}`,
      severity: "CRITICAL",
      title: `Batch ${row.batchNumber} is complete but remains on quality hold.`,
      detail: row.holdReason ?? "Review required before release.",
      href: `/batches?batch=${row.id}`,
    });
  } else if (onHoldCompleted.length > 1) {
    items.push({
      id: "batch-hold-many",
      severity: "CRITICAL",
      title: `${onHoldCompleted.length} completed batches remain on quality hold.`,
      detail: "Open batch operations to review hold reasons.",
      href: "/batches?view=hold",
    });
  }

  const awaitingReview = batches.filter(
    (row) => row.qualityStatus === "PENDING_REVIEW" && row.manufacturingStatus === "COMPLETED"
  );
  if (awaitingReview.length === 1) {
    items.push({
      id: `batch-review-${awaitingReview[0]!.id}`,
      severity: "HIGH",
      title: `Batch ${awaitingReview[0]!.batchNumber} is awaiting quality review.`,
      detail: "Production is complete — quality decision required.",
      href: `/batches?batch=${awaitingReview[0]!.id}`,
    });
  } else if (awaitingReview.length > 1) {
    items.push({
      id: "batch-review-queue",
      severity: "HIGH",
      title: `${awaitingReview.length} completed batches are awaiting quality review.`,
      detail: "Release, hold, or reject after explicit review.",
      href: "/batches?view=review",
    });
  }

  const underProduced = batches.filter(
    (row) =>
      row.producedQuantity != null &&
      row.plannedQuantity > 0 &&
      row.producedQuantity < row.plannedQuantity &&
      row.manufacturingStatus === "COMPLETED"
  );
  if (underProduced.length === 1) {
    const row = underProduced[0]!;
    items.push({
      id: `batch-qty-${row.id}`,
      severity: "WARNING",
      title: `Batch ${row.batchNumber} quantity is below planned output.`,
      detail: `Produced ${row.producedQuantity} of ${row.plannedQuantity} planned.`,
      href: `/batches?batch=${row.id}`,
    });
  } else if (underProduced.length > 1) {
    items.push({
      id: "batch-qty-many",
      severity: "WARNING",
      title: `${underProduced.length} completed batches are below planned output.`,
      detail: "Produced quantity is recorded and lower than planned. Open the batch to inspect.",
      href: "/batches",
    });
  }

  return items;
}

export function qualityActionLabel(action: BatchQualityAction | null): string | null {
  if (!action) return null;
  if (action === "HOLD") return "Placed on hold";
  if (action === "RELEASE") return "Released";
  return "Rejected";
}
