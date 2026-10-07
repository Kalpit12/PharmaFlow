import type {
  CreateCorrectiveActionInput,
  CreateQualityExceptionInput,
  QualityExceptionRow,
  QualityExceptionStatus,
  QualitySnapshot,
  QualityViewId,
  UpdateCorrectiveActionInput,
  UpdateQualityExceptionInput,
} from "@/lib/quality/types";
import {
  allowedQualityTransitions,
  buildQualityAttention,
  canTransitionQualityStatus,
  computeAgeDays,
  computeDueState,
  isOpenQualityStatus,
  nextQualityReference,
  parseQualitySeverity,
  parseQualityStatus,
  parseQualityType,
  validateQualityText,
} from "@/lib/quality/service";
import { getTraceabilitySnapshot, resolveTraceabilityFilters } from "@/lib/server/traceability";
import { can, requirePermission } from "@/lib/auth/authorization";
import { formatStateChange, writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";
import { formatCount } from "@/lib/server/money";

export type QualityFilters = {
  view: QualityViewId;
  exceptionId?: string;
  query?: string;
  type?: string;
  severity?: string;
  ownerId?: string;
};

function parseView(value?: string): QualityViewId {
  const views: QualityViewId[] = ["all", "open", "critical", "overdue", "unassigned"];
  return views.includes(value as QualityViewId) ? (value as QualityViewId) : "all";
}

export function resolveQualityFilters(input: {
  view?: string;
  exception?: string;
  q?: string;
  type?: string;
  severity?: string;
  owner?: string;
}): QualityFilters {
  return {
    view: parseView(input.view),
    exceptionId: input.exception?.trim() || undefined,
    query: input.q?.trim() || undefined,
    type: input.type?.trim() || undefined,
    severity: input.severity?.trim() || undefined,
    ownerId: input.owner?.trim() || undefined,
  };
}

function formatSalesOrderReference(id: string): string {
  return `SO-${id.slice(0, 8).toUpperCase()}`;
}

async function assertLinkedEntityScope(ctx: TenantContext, input: CreateQualityExceptionInput): Promise<void> {
  const prisma = getPrisma();
  if (input.productionBatchId) {
    const row = await prisma.productionBatch.findFirst({ where: { id: input.productionBatchId, tenantId: ctx.tenantId } });
    if (!row) throw new ServerError("Production batch not found.", "NOT_FOUND");
  }
  if (input.productionOrderId) {
    const row = await prisma.productionOrder.findFirst({ where: { id: input.productionOrderId, tenantId: ctx.tenantId } });
    if (!row) throw new ServerError("Production order not found.", "NOT_FOUND");
  }
  if (input.inventoryLotId) {
    const row = await prisma.inventoryLot.findFirst({ where: { id: input.inventoryLotId, tenantId: ctx.tenantId } });
    if (!row) throw new ServerError("Material lot not found.", "NOT_FOUND");
  }
  if (input.productId) {
    const row = await prisma.product.findFirst({ where: { id: input.productId, tenantId: ctx.tenantId } });
    if (!row) throw new ServerError("Product not found.", "NOT_FOUND");
  }
  if (input.orderId) {
    const row = await prisma.order.findFirst({ where: { id: input.orderId, tenantId: ctx.tenantId } });
    if (!row) throw new ServerError("Sales order not found.", "NOT_FOUND");
  }
  if (input.customerId) {
    const row = await prisma.customer.findFirst({ where: { id: input.customerId, tenantId: ctx.tenantId } });
    if (!row) throw new ServerError("Customer not found.", "NOT_FOUND");
  }
  if (input.ownerId) {
    const row = await prisma.user.findFirst({ where: { id: input.ownerId, tenantId: ctx.tenantId, status: "ACTIVE" } });
    if (!row) throw new ServerError("Owner not found.", "NOT_FOUND");
  }
}

async function fetchExceptionRows(ctx: TenantContext) {
  return getPrisma().qualityException.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      owner: { select: { id: true, name: true } },
      productionBatch: { select: { id: true, batchNumber: true, qualityStatus: true } },
      productionOrder: { select: { id: true, orderNumber: true } },
      inventoryLot: { select: { id: true, batchCode: true } },
      product: { select: { id: true, name: true, sku: true } },
      order: { select: { id: true } },
      customer: { select: { id: true, name: true } },
      correctiveActions: {
        include: { owner: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      events: {
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
    orderBy: [{ updatedAt: "desc" }, { reference: "asc" }],
  });
}

async function mapExceptionRow(
  ctx: TenantContext,
  row: Awaited<ReturnType<typeof fetchExceptionRows>>[number],
  options?: { includeTraceability?: boolean }
): Promise<QualityExceptionRow> {
  const entityLabel =
    row.productionBatch?.batchNumber ??
    row.inventoryLot?.batchCode ??
    row.product?.name ??
    (row.order ? formatSalesOrderReference(row.order.id) : null) ??
    row.customer?.name ??
    row.productionOrder?.orderNumber ??
    "No linked entity";

  let traceabilityImpact = null;
  if (options?.includeTraceability) {
    if (row.productionBatchId) {
      const trace = await getTraceabilitySnapshot(ctx, resolveTraceabilityFilters({ batch: row.productionBatchId }));
      traceabilityImpact = trace.investigation?.impact ?? null;
    } else if (row.inventoryLotId) {
      const trace = await getTraceabilitySnapshot(ctx, resolveTraceabilityFilters({ lot: row.inventoryLotId }));
      traceabilityImpact = trace.investigation?.impact ?? null;
    }
  }

  const createdAt = row.createdAt.toISOString();
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    description: row.description,
    type: row.type,
    severity: row.severity,
    status: row.status,
    ownerId: row.ownerId,
    ownerName: row.owner?.name ?? null,
    dueDate: row.dueDate?.toISOString() ?? null,
    dueState: computeDueState(row.dueDate?.toISOString(), row.status),
    ageDays: computeAgeDays(createdAt),
    investigationNotes: row.investigationNotes,
    findings: row.findings,
    resolutionNotes: row.resolutionNotes,
    entity: {
      batchId: row.productionBatchId,
      batchNumber: row.productionBatch?.batchNumber ?? null,
      batchQualityStatus: row.productionBatch?.qualityStatus ?? null,
      productionOrderId: row.productionOrderId,
      orderNumber: row.productionOrder?.orderNumber ?? null,
      productId: row.productId,
      productName: row.product?.name ?? null,
      inventoryLotId: row.inventoryLotId,
      lotCode: row.inventoryLot?.batchCode ?? null,
      orderId: row.orderId,
      orderReference: row.order ? formatSalesOrderReference(row.order.id) : null,
      customerId: row.customerId,
      customerName: row.customer?.name ?? null,
      entityLabel,
    },
    correctiveActions: row.correctiveActions.map((action) => ({
      id: action.id,
      description: action.description,
      ownerId: action.ownerId,
      ownerName: action.owner?.name ?? null,
      dueDate: action.dueDate?.toISOString() ?? null,
      status: action.status,
      completedAt: action.completedAt?.toISOString() ?? null,
      createdAt: action.createdAt.toISOString(),
    })),
    timeline: row.events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      label:
        event.eventType === "STATUS"
          ? `Status ${event.fromStatus ?? "—"} → ${event.toStatus ?? "—"}`
          : event.eventType === "CREATED"
            ? "Exception created"
            : event.eventType === "CORRECTIVE"
              ? "Corrective action updated"
              : event.eventType,
      detail: event.note,
      actorName: event.actor?.name ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
    traceabilityImpact,
    createdAt,
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    allowedTransitions: allowedQualityTransitions(row.status),
  };
}

function filterRows(rows: QualityExceptionRow[], filters: QualityFilters): QualityExceptionRow[] {
  const query = filters.query?.toLowerCase();
  return rows.filter((row) => {
    if (filters.view === "open" && !isOpenQualityStatus(row.status)) return false;
    if (filters.view === "critical" && row.severity !== "CRITICAL" && row.severity !== "HIGH") return false;
    if (filters.view === "overdue" && row.dueState !== "OVERDUE") return false;
    if (filters.view === "unassigned" && row.ownerName) return false;
    if (filters.type && row.type !== filters.type) return false;
    if (filters.severity && row.severity !== filters.severity) return false;
    if (filters.ownerId && row.ownerId !== filters.ownerId) return false;
    if (query) {
      const haystack = [
        row.reference,
        row.title,
        row.description,
        row.entity.batchNumber,
        row.entity.lotCode,
        row.entity.productName,
        row.entity.customerName,
        row.ownerName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export async function getQualitySnapshot(ctx: TenantContext, filters: QualityFilters): Promise<QualitySnapshot> {
  requirePermission(ctx, "quality.read");
  const prisma = getPrisma();
  const [tenant, rawRows, users, batchRows] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, status: true } }),
    fetchExceptionRows(ctx),
    prisma.user.findMany({ where: { tenantId: ctx.tenantId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.productionBatch.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        batchNumber: true,
        productionOrder: { select: { product: { select: { name: true } } } },
      },
    }),
  ]);

  const allRows = await Promise.all(
    rawRows.map((row) => mapExceptionRow(ctx, row, { includeTraceability: filters.exceptionId === row.id }))
  );
  const rows = filterRows(allRows, filters);
  const attention = buildQualityAttention(allRows);
  const open = allRows.filter((row) => isOpenQualityStatus(row.status));
  const criticalHigh = open.filter((row) => row.severity === "CRITICAL" || row.severity === "HIGH");
  const overdue = open.filter((row) => row.dueState === "OVERDUE");
  const unassigned = open.filter((row) => !row.ownerName);
  const awaiting = open.filter((row) => row.status === "ACTION_REQUIRED" || row.status === "INVESTIGATING");

  const severityDistribution = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((label) => ({
    label,
    value: allRows.filter((row) => row.severity === label).length,
  }));
  const statusDistribution = ["OPEN", "INVESTIGATING", "ACTION_REQUIRED", "RESOLVED", "CLOSED"].map((label) => ({
    label: label
      .split("_")
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" "),
    value: allRows.filter((row) => row.status === label).length,
  }));

  let emptyReason: string | null = null;
  if (allRows.length === 0) emptyReason = "No quality exceptions are recorded for this workspace.";
  else if (rows.length === 0) emptyReason = "No exceptions match the current filters.";

  return {
    brand: tenant?.name ?? "Workspace",
    disclaimer: tenant?.status === "DEMO" ? "Demo workspace data · operational quality exceptions only" : "Operational quality exceptions only",
    generatedAt: new Date().toISOString(),
    view: filters.view,
    kpis: [
      { id: "open", label: "Open exceptions", value: formatCount(open.length), hint: "Open, investigating, or action required" },
      { id: "critical", label: "Critical / high", value: formatCount(criticalHigh.length), hint: "Open severity focus" },
      { id: "overdue", label: "Overdue", value: formatCount(overdue.length), hint: "Past due date" },
      { id: "unassigned", label: "Unassigned", value: formatCount(unassigned.length), hint: "No owner recorded" },
      { id: "awaiting", label: "Awaiting resolution", value: formatCount(awaiting.length), hint: "Investigation or action required" },
    ],
    exceptions: rows,
    attention,
    severityDistribution,
    statusDistribution,
    ownerOptions: users,
    emptyReason,
    capabilities: {
      canManage: can(ctx.role, "quality.manage"),
    },
    batchOptions: batchRows.map((row) => ({
      id: row.id,
      batchNumber: row.batchNumber,
      productName: row.productionOrder.product.name,
    })),
  };
}

export async function getQualityAttention(ctx: TenantContext) {
  const rawRows = await fetchExceptionRows(ctx);
  const rows = await Promise.all(rawRows.map((row) => mapExceptionRow(ctx, row)));
  return buildQualityAttention(rows);
}

async function getExceptionOrThrow(ctx: TenantContext, id: string) {
  const row = await getPrisma().qualityException.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!row) throw new ServerError("Quality exception not found.", "NOT_FOUND");
  return row;
}

export async function createQualityException(ctx: TenantContext, input: CreateQualityExceptionInput) {
  requirePermission(ctx, "quality.manage");
  const titleError = validateQualityText(input.title, "Title", 160);
  const descriptionError = validateQualityText(input.description, "Description");
  if (titleError || descriptionError) throw new ServerError(titleError ?? descriptionError ?? "Invalid input.", "INTERNAL");
  if (!parseQualityType(input.type)) throw new ServerError("Invalid exception type.", "INTERNAL");
  if (!parseQualitySeverity(input.severity)) throw new ServerError("Invalid severity.", "INTERNAL");
  await assertLinkedEntityScope(ctx, input);

  const prisma = getPrisma();
  const count = await prisma.qualityException.count({ where: { tenantId: ctx.tenantId } });
  const reference = nextQualityReference(count);
  const row = await prisma.qualityException.create({
    data: {
      tenantId: ctx.tenantId,
      reference,
      title: input.title.trim(),
      description: input.description.trim(),
      type: input.type,
      severity: input.severity,
      ownerId: input.ownerId ?? null,
      createdById: ctx.userId,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      productionBatchId: input.productionBatchId ?? null,
      productionOrderId: input.productionOrderId ?? null,
      inventoryLotId: input.inventoryLotId ?? null,
      productId: input.productId ?? null,
      orderId: input.orderId ?? null,
      customerId: input.customerId ?? null,
      events: {
        create: {
          tenantId: ctx.tenantId,
          eventType: "CREATED",
          toStatus: "OPEN",
          note: "Quality exception opened.",
          actorId: ctx.userId,
        },
      },
    },
  });
  await writeAuditLog(ctx, {
    action: "QUALITY_EXCEPTION_CREATED",
    entityType: "QUALITY_EXCEPTION",
    entityId: row.id,
    newValue: `REFERENCE: ${reference}`,
  });
  return mapExceptionRow(ctx, (await fetchExceptionRows(ctx)).find((item) => item.id === row.id)!, { includeTraceability: true });
}

export async function updateQualityException(ctx: TenantContext, id: string, input: UpdateQualityExceptionInput) {
  requirePermission(ctx, "quality.manage");
  const existing = await getExceptionOrThrow(ctx, id);
  if (existing.status === "CLOSED") throw new ServerError("Closed exceptions cannot be edited.", "FORBIDDEN");
  if (input.title) {
    const error = validateQualityText(input.title, "Title", 160);
    if (error) throw new ServerError(error, "INTERNAL");
  }
  if (input.description) {
    const error = validateQualityText(input.description, "Description");
    if (error) throw new ServerError(error, "INTERNAL");
  }
  if (input.ownerId) {
    await assertLinkedEntityScope(ctx, { ...input, title: "x", description: "xxx", type: "OTHER", severity: "LOW", ownerId: input.ownerId });
  }

  await getPrisma().qualityException.update({
    where: { id: existing.id },
    data: {
      title: input.title?.trim(),
      description: input.description?.trim(),
      type: input.type,
      severity: input.severity,
      ownerId: input.ownerId === undefined ? undefined : input.ownerId,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      investigationNotes: input.investigationNotes?.trim(),
      findings: input.findings?.trim(),
      resolutionNotes: input.resolutionNotes?.trim(),
    },
  });
  if (input.investigationNotes || input.findings || input.resolutionNotes) {
    await writeAuditLog(ctx, {
      action: "QUALITY_INVESTIGATION_UPDATED",
      entityType: "QUALITY_EXCEPTION",
      entityId: existing.id,
    });
  }
  const mapped = (await fetchExceptionRows(ctx)).find((row) => row.id === id);
  if (!mapped) throw new ServerError("Quality exception not found.", "NOT_FOUND");
  return mapExceptionRow(ctx, mapped, { includeTraceability: true });
}

export async function transitionQualityException(ctx: TenantContext, id: string, toStatus: QualityExceptionStatus, note?: string) {
  requirePermission(ctx, "quality.manage");
  const parsed = parseQualityStatus(toStatus);
  if (!parsed) throw new ServerError("Invalid status.", "INTERNAL");
  const existing = await getExceptionOrThrow(ctx, id);
  if (!canTransitionQualityStatus(existing.status, parsed)) {
    throw new ServerError(`Cannot transition from ${existing.status} to ${parsed}.`, "INTERNAL");
  }

  const now = new Date();
  await getPrisma().qualityException.update({
    where: { id: existing.id },
    data: {
      status: parsed,
      resolvedAt: parsed === "RESOLVED" || parsed === "CLOSED" ? existing.resolvedAt ?? now : null,
      closedAt: parsed === "CLOSED" ? now : existing.closedAt,
      events: {
        create: {
          tenantId: ctx.tenantId,
          eventType: "STATUS",
          fromStatus: existing.status,
          toStatus: parsed,
          note: note?.trim() || null,
          actorId: ctx.userId,
        },
      },
    },
  });
  const change = formatStateChange("STATUS", existing.status, parsed);
  await writeAuditLog(ctx, {
    action: "QUALITY_EXCEPTION_TRANSITION",
    entityType: "QUALITY_EXCEPTION",
    entityId: existing.id,
    oldValue: change.oldValue,
    newValue: change.newValue,
    reason: note?.trim() || null,
  });
  const mapped = (await fetchExceptionRows(ctx)).find((row) => row.id === id);
  if (!mapped) throw new ServerError("Quality exception not found.", "NOT_FOUND");
  return mapExceptionRow(ctx, mapped, { includeTraceability: true });
}

export async function createCorrectiveAction(ctx: TenantContext, exceptionId: string, input: CreateCorrectiveActionInput) {
  requirePermission(ctx, "quality.manage");
  const existing = await getExceptionOrThrow(ctx, exceptionId);
  if (existing.status === "CLOSED") throw new ServerError("Closed exceptions cannot receive new actions.", "FORBIDDEN");
  const error = validateQualityText(input.description, "Action description");
  if (error) throw new ServerError(error, "INTERNAL");
  if (input.ownerId) {
    await assertLinkedEntityScope(ctx, {
      title: "x",
      description: "xxx",
      type: "OTHER",
      severity: "LOW",
      ownerId: input.ownerId,
    });
  }

  await getPrisma().qualityCorrectiveAction.create({
    data: {
      tenantId: ctx.tenantId,
      exceptionId,
      description: input.description.trim(),
      ownerId: input.ownerId ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: "OPEN",
    },
  });
  await getPrisma().qualityExceptionEvent.create({
    data: {
      tenantId: ctx.tenantId,
      exceptionId,
      eventType: "CORRECTIVE",
      note: "Corrective action added.",
      actorId: ctx.userId,
    },
  });
  await writeAuditLog(ctx, {
    action: "QUALITY_CORRECTIVE_CREATED",
    entityType: "QUALITY_EXCEPTION",
    entityId: exceptionId,
  });
  const mapped = (await fetchExceptionRows(ctx)).find((row) => row.id === exceptionId);
  if (!mapped) throw new ServerError("Quality exception not found.", "NOT_FOUND");
  return mapExceptionRow(ctx, mapped, { includeTraceability: true });
}

export async function updateCorrectiveAction(ctx: TenantContext, actionId: string, input: UpdateCorrectiveActionInput) {
  requirePermission(ctx, "quality.manage");
  const action = await getPrisma().qualityCorrectiveAction.findFirst({
    where: { id: actionId, tenantId: ctx.tenantId },
    include: { exception: true },
  });
  if (!action) throw new ServerError("Corrective action not found.", "NOT_FOUND");
  if (action.exception.status === "CLOSED") throw new ServerError("Closed exceptions cannot be updated.", "FORBIDDEN");
  if (input.description) {
    const error = validateQualityText(input.description, "Action description");
    if (error) throw new ServerError(error, "INTERNAL");
  }

  const completedAt =
    input.status === "COMPLETED" ? action.completedAt ?? new Date() : input.status ? null : undefined;

  await getPrisma().qualityCorrectiveAction.update({
    where: { id: action.id },
    data: {
      description: input.description?.trim(),
      ownerId: input.ownerId === undefined ? undefined : input.ownerId,
      dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      status: input.status,
      completedAt,
    },
  });
  if (input.status && input.status !== action.status) {
    const change = formatStateChange("CORRECTIVE_STATUS", action.status, input.status);
    await writeAuditLog(ctx, {
      action: "QUALITY_CORRECTIVE_UPDATED",
      entityType: "QUALITY_CORRECTIVE_ACTION",
      entityId: action.id,
      oldValue: change.oldValue,
      newValue: change.newValue,
    });
  }
  const mapped = (await fetchExceptionRows(ctx)).find((row) => row.id === action.exceptionId);
  if (!mapped) throw new ServerError("Quality exception not found.", "NOT_FOUND");
  return mapExceptionRow(ctx, mapped, { includeTraceability: true });
}
