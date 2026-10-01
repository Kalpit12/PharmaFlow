import type { BatchQualityStatus } from "@/lib/batches/types";
import type { ProductionOrderStatus } from "@prisma/client";

import {
  buildBatchAttention,
  buildMaterialTrace,
  canPlaceBatchOnHold,
  canRejectBatch,
  canReleaseBatch,
  computeBatchQuantities,
  computeBatchRisk,
  qualityActionLabel,
  validateHoldReason,
} from "@/lib/batches/service";
import {
  BATCH_QUALITY_VIEWS,
  type BatchQualityViewId,
  type BatchRow,
  type BatchesSnapshot,
} from "@/lib/batches/types";
import { requirePermission, can } from "@/lib/auth/authorization";
import { formatStateChange, writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";
import { formatCount } from "@/lib/server/money";

export type BatchesFilters = {
  view: BatchQualityViewId;
  batchId?: string;
  query?: string;
};

function parseView(value?: string): BatchQualityViewId {
  return BATCH_QUALITY_VIEWS.includes(value as BatchQualityViewId) ? (value as BatchQualityViewId) : "all";
}

export function resolveBatchesFilters(input: { view?: string; batch?: string; q?: string }): BatchesFilters {
  return {
    view: parseView(input.view),
    batchId: input.batch?.trim() || undefined,
    query: input.q?.trim() || undefined,
  };
}

function mapRow(
  row: Awaited<ReturnType<typeof fetchBatchRows>>[number],
  bomsByProduct: Map<string, Array<{ componentId: string; quantityPer: number; sku: string; name: string; unit: string }>>
): BatchRow {
  const manufacturingStatus = row.productionOrder.status;
  const productionCompleted = manufacturingStatus === "COMPLETED";
  const transition = {
    qualityStatus: row.qualityStatus,
    manufacturingStatus,
    productionCompleted,
  };
  const quantities = computeBatchQuantities({
    plannedQuantity: row.plannedQuantity,
    producedQuantity: row.producedQuantity,
  });
  const boms = bomsByProduct.get(row.productionOrder.productId) ?? [];
  return {
    id: row.id,
    batchNumber: row.batchNumber,
    productId: row.productionOrder.productId,
    productName: row.productionOrder.product.name,
    productSku: row.productionOrder.product.sku,
    unit: row.productionOrder.product.unit ?? "unit",
    productionOrderId: row.productionOrderId,
    orderNumber: row.productionOrder.orderNumber,
    manufacturingStatus,
    qualityStatus: row.qualityStatus,
    plannedQuantity: row.plannedQuantity,
    producedQuantity: row.producedQuantity,
    producedLabel: quantities.producedLabel,
    remainingQuantity: quantities.remainingQuantity,
    completionPercent: quantities.completionPercent,
    holdReason: row.holdReason,
    reviewOwnerName: row.reviewOwner?.name ?? null,
    lastQualityAction: row.lastQualityAction,
    lastQualityActionAt: row.lastQualityActionAt?.toISOString() ?? null,
    lastQualityActionByName: row.lastQualityActionBy?.name ?? null,
    risk: computeBatchRisk({
      qualityStatus: row.qualityStatus,
      manufacturingStatus,
      plannedQuantity: row.plannedQuantity,
      producedQuantity: row.producedQuantity,
    }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    productionStartedAt: row.productionStartedAt?.toISOString() ?? null,
    productionCompletedAt: row.productionCompletedAt?.toISOString() ?? null,
    canHold: canPlaceBatchOnHold(transition),
    canRelease: canReleaseBatch(transition),
    canReject: canRejectBatch(transition),
    materialTrace: buildMaterialTrace({
      productId: row.productionOrder.productId,
      plannedQuantity: row.plannedQuantity,
      boms,
      inputLots: row.inputLots.map((lot) => ({
        productId: lot.productId,
        inventoryLot: lot.inventoryLot,
        quantityUsed: lot.quantityUsed,
      })),
    }),
    qualityEvents: row.qualityEvents.map((event) => ({
      id: event.id,
      action: event.action,
      reason: event.reason,
      actorName: event.actor?.name ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

async function fetchBatchRows(ctx: TenantContext) {
  return getPrisma().productionBatch.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      productionOrder: { include: { product: true } },
      reviewOwner: { select: { name: true } },
      lastQualityActionBy: { select: { name: true } },
      inputLots: { include: { inventoryLot: { select: { batchCode: true } } } },
      qualityEvents: {
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
    orderBy: [{ updatedAt: "desc" }, { batchNumber: "asc" }],
  });
}

async function fetchBoms(ctx: TenantContext) {
  const rows = await getPrisma().billOfMaterial.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      component: { select: { id: true, sku: true, name: true, unit: true } },
    },
  });
  const map = new Map<string, Array<{ componentId: string; quantityPer: number; sku: string; name: string; unit: string }>>();
  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    list.push({
      componentId: row.componentId,
      quantityPer: Number(row.quantityPer.toString()),
      sku: row.component.sku,
      name: row.component.name,
      unit: row.component.unit ?? "unit",
    });
    map.set(row.productId, list);
  }
  return map;
}

export async function getBatchesSnapshot(ctx: TenantContext, filters: BatchesFilters): Promise<BatchesSnapshot> {
  const prisma = getPrisma();
  const [tenant, rawRows, bomsByProduct] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, status: true } }),
    fetchBatchRows(ctx),
    fetchBoms(ctx),
  ]);

  const allRows = rawRows.map((row) => mapRow(row, bomsByProduct));
  const query = filters.query?.toLowerCase();
  let batches = allRows.filter((row) => {
    if (filters.view === "review" && !(row.qualityStatus === "PENDING_REVIEW" && row.manufacturingStatus === "COMPLETED")) {
      return false;
    }
    if (filters.view === "hold" && row.qualityStatus !== "ON_HOLD") return false;
    if (filters.view === "released" && row.qualityStatus !== "RELEASED") return false;
    if (filters.view === "rejected" && row.qualityStatus !== "REJECTED") return false;
    if (query && !row.batchNumber.toLowerCase().includes(query) && !row.productName.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });

  const active = allRows.filter((row) => row.manufacturingStatus === "IN_PROGRESS" || row.manufacturingStatus === "SCHEDULED");
  const awaitingReview = allRows.filter(
    (row) => row.qualityStatus === "PENDING_REVIEW" && row.manufacturingStatus === "COMPLETED"
  );
  const onHold = allRows.filter((row) => row.qualityStatus === "ON_HOLD");
  const released = allRows.filter((row) => row.qualityStatus === "RELEASED");
  const rejected = allRows.filter((row) => row.qualityStatus === "REJECTED");
  const attention = buildBatchAttention(allRows);

  let emptyReason: string | null = null;
  if (allRows.length === 0) {
    emptyReason = "No production batches are recorded for this workspace.";
  } else if (batches.length === 0) {
    emptyReason = "No batches match the current filters.";
  }

  return {
    brand: tenant?.name ?? "Workspace",
    disclaimer: tenant?.status === "DEMO" ? "Demo workspace data" : "Workspace data",
    generatedAt: new Date().toISOString(),
    view: filters.view,
    kpis: [
      { id: "active", label: "Active batches", value: formatCount(active.length), hint: "Scheduled or in progress" },
      {
        id: "review",
        label: "Awaiting quality review",
        value: formatCount(awaitingReview.length),
        hint: "Production complete — decision required",
      },
      { id: "hold", label: "On hold", value: formatCount(onHold.length), hint: "Quality hold with reason" },
      { id: "released", label: "Released", value: formatCount(released.length), hint: "Explicit quality release" },
      { id: "rejected", label: "Rejected", value: formatCount(rejected.length), hint: "Explicit quality rejection" },
    ],
    batches,
    attention,
    emptyReason,
    capabilities: {
      canQualityAction: can(ctx.role, "batches.quality_action"),
    },
  };
}

async function getBatchForMutation(ctx: TenantContext, batchId: string) {
  const batch = await getPrisma().productionBatch.findFirst({
    where: { id: batchId, tenantId: ctx.tenantId },
    include: { productionOrder: true },
  });
  if (!batch) throw new ServerError("Batch not found.", "NOT_FOUND");
  return batch;
}

async function recordQualityEvent(
  ctx: TenantContext,
  batchId: string,
  action: "HOLD" | "RELEASE" | "REJECT",
  reason: string | null
) {
  await getPrisma().productionBatchQualityEvent.create({
    data: {
      tenantId: ctx.tenantId,
      batchId,
      action,
      reason,
      actorId: ctx.userId,
    },
  });
}

export async function holdProductionBatch(ctx: TenantContext, batchId: string, reason: string) {
  requirePermission(ctx, "batches.quality_action");
  const validation = validateHoldReason(reason);
  if (validation) throw new ServerError(validation, "INTERNAL");
  const batch = await getBatchForMutation(ctx, batchId);
  const transition = {
    qualityStatus: batch.qualityStatus,
    manufacturingStatus: batch.productionOrder.status,
    productionCompleted: batch.productionOrder.status === "COMPLETED",
  };
  if (!canPlaceBatchOnHold(transition)) {
    throw new ServerError("This batch cannot be placed on hold in its current quality state.", "INTERNAL");
  }
  const updated = await getPrisma().productionBatch.update({
    where: { id: batch.id },
    data: {
      qualityStatus: "ON_HOLD",
      holdReason: reason.trim(),
      lastQualityAction: "HOLD",
      lastQualityActionAt: new Date(),
      lastQualityActionById: ctx.userId,
      reviewOwnerId: ctx.userId,
    },
  });
  await recordQualityEvent(ctx, batch.id, "HOLD", reason.trim());
  const change = formatStateChange("QUALITY_STATUS", batch.qualityStatus, "ON_HOLD");
  await writeAuditLog(ctx, {
    action: "BATCH_HOLD",
    entityType: "PRODUCTION_BATCH",
    entityId: batch.id,
    oldValue: change.oldValue,
    newValue: change.newValue,
    reason: reason.trim(),
  });
  return { batch: updated, message: qualityActionLabel("HOLD") };
}

export async function releaseProductionBatch(ctx: TenantContext, batchId: string, reason?: string | null) {
  requirePermission(ctx, "batches.quality_action");
  const batch = await getBatchForMutation(ctx, batchId);
  const transition = {
    qualityStatus: batch.qualityStatus,
    manufacturingStatus: batch.productionOrder.status,
    productionCompleted: batch.productionOrder.status === "COMPLETED",
  };
  if (!canReleaseBatch(transition)) {
    throw new ServerError(
      batch.productionOrder.status !== "COMPLETED"
        ? "Release requires production to be completed."
        : "This batch cannot be released from its current quality state.",
      "INTERNAL"
    );
  }
  const updated = await getPrisma().productionBatch.update({
    where: { id: batch.id },
    data: {
      qualityStatus: "RELEASED",
      holdReason: null,
      lastQualityAction: "RELEASE",
      lastQualityActionAt: new Date(),
      lastQualityActionById: ctx.userId,
    },
  });
  await recordQualityEvent(ctx, batch.id, "RELEASE", reason?.trim() || null);
  const change = formatStateChange("QUALITY_STATUS", batch.qualityStatus, "RELEASED");
  await writeAuditLog(ctx, {
    action: "BATCH_RELEASE",
    entityType: "PRODUCTION_BATCH",
    entityId: batch.id,
    oldValue: change.oldValue,
    newValue: change.newValue,
    reason: reason?.trim() || null,
  });
  return { batch: updated, message: qualityActionLabel("RELEASE") };
}

export async function rejectProductionBatch(ctx: TenantContext, batchId: string, reason?: string | null) {
  requirePermission(ctx, "batches.quality_action");
  const batch = await getBatchForMutation(ctx, batchId);
  const transition = {
    qualityStatus: batch.qualityStatus,
    manufacturingStatus: batch.productionOrder.status,
    productionCompleted: batch.productionOrder.status === "COMPLETED",
  };
  if (!canRejectBatch(transition)) {
    throw new ServerError(
      batch.productionOrder.status !== "COMPLETED"
        ? "Reject requires production to be completed."
        : "This batch cannot be rejected from its current quality state.",
      "INTERNAL"
    );
  }
  const updated = await getPrisma().productionBatch.update({
    where: { id: batch.id },
    data: {
      qualityStatus: "REJECTED",
      holdReason: reason?.trim() || batch.holdReason,
      lastQualityAction: "REJECT",
      lastQualityActionAt: new Date(),
      lastQualityActionById: ctx.userId,
    },
  });
  await recordQualityEvent(ctx, batch.id, "REJECT", reason?.trim() || null);
  const change = formatStateChange("QUALITY_STATUS", batch.qualityStatus, "REJECTED");
  await writeAuditLog(ctx, {
    action: "BATCH_REJECT",
    entityType: "PRODUCTION_BATCH",
    entityId: batch.id,
    oldValue: change.oldValue,
    newValue: change.newValue,
    reason: reason?.trim() || null,
  });
  return { batch: updated, message: qualityActionLabel("REJECT") };
}

export async function countBatchAttention(ctx: TenantContext): Promise<number> {
  const snapshot = await getBatchesSnapshot(ctx, { view: "all" });
  return snapshot.attention.length;
}
