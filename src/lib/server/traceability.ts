import {
  buildTraceabilityAttention,
  buildTraceabilityIndexes,
  investigateEntity,
  resolveEntityFromQuery,
  type TraceabilityGraph,
} from "@/lib/traceability/service";
import type {
  TraceabilityEntityOption,
  TraceabilityEntityType,
  TraceabilitySnapshot,
} from "@/lib/traceability/types";
import { REALIZED_ORDER_STATUSES } from "@/lib/server/analytics";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";
import { formatCount } from "@/lib/server/money";

export type TraceabilityFilters = {
  lotId?: string;
  batchId?: string;
  orderId?: string;
  customerId?: string;
  query?: string;
};

function formatSalesOrderReference(id: string): string {
  return `SO-${id.slice(0, 8).toUpperCase()}`;
}

export function resolveTraceabilityFilters(input: {
  lot?: string;
  batch?: string;
  order?: string;
  customer?: string;
  q?: string;
}): TraceabilityFilters {
  return {
    lotId: input.lot?.trim() || undefined,
    batchId: input.batch?.trim() || undefined,
    orderId: input.order?.trim() || undefined,
    customerId: input.customer?.trim() || undefined,
    query: input.q?.trim() || undefined,
  };
}

async function loadTraceabilityGraph(ctx: TenantContext): Promise<TraceabilityGraph> {
  const tenantId = ctx.tenantId;
  const prisma = getPrisma();
  const [rawLots, rawInputLots, rawBatches, rawOrders, rawCustomers, rawBoms] = await Promise.all([
    prisma.inventoryLot.findMany({
      where: { tenantId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        supplier: { select: { id: true, name: true } },
        receipt: { select: { reference: true, receivedAt: true } },
      },
      orderBy: [{ receivedAt: "desc" }, { batchCode: "asc" }],
    }),
    prisma.productionBatchInputLot.findMany({
      where: { tenantId },
      select: { batchId: true, inventoryLotId: true, quantityUsed: true },
    }),
    prisma.productionBatch.findMany({
      where: { tenantId },
      include: {
        productionOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            product: { select: { id: true, name: true, sku: true } },
          },
        },
        inputLots: { select: { inventoryLotId: true, quantityUsed: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { batchNumber: "asc" }],
    }),
    prisma.order.findMany({
      where: { tenantId, status: { in: [...REALIZED_ORDER_STATUSES] } },
      include: {
        customer: { select: { id: true, name: true } },
        items: { select: { productId: true } },
      },
      orderBy: { orderedAt: "desc" },
    }),
    prisma.customer.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.billOfMaterial.findMany({
      where: { tenantId },
      select: { productId: true, componentId: true },
    }),
  ]);

  const inputLotsByBatch = new Map<string, Array<{ inventoryLotId: string | null; quantityUsed: number | null }>>();
  for (const row of rawInputLots) {
    const list = inputLotsByBatch.get(row.batchId) ?? [];
    list.push({ inventoryLotId: row.inventoryLotId, quantityUsed: row.quantityUsed });
    inputLotsByBatch.set(row.batchId, list);
  }

  return buildTraceabilityIndexes({
    lots: rawLots.map((lot) => ({
      id: lot.id,
      batchCode: lot.batchCode,
      productId: lot.product.id,
      productName: lot.product.name,
      productSku: lot.product.sku,
      supplierId: lot.supplierId,
      supplierName: lot.supplier?.name ?? null,
      quantity: lot.quantity,
      receivedAt: lot.receivedAt.toISOString(),
      receiptReference: lot.receipt?.reference ?? null,
    })),
    batches: rawBatches.map((batch) => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      productId: batch.productionOrder.product.id,
      productName: batch.productionOrder.product.name,
      productSku: batch.productionOrder.product.sku,
      qualityStatus: batch.qualityStatus,
      plannedQuantity: batch.plannedQuantity,
      producedQuantity: batch.producedQuantity,
      productionOrderId: batch.productionOrder.id,
      orderNumber: batch.productionOrder.orderNumber,
      manufacturingCompleted: batch.productionOrder.status === "COMPLETED",
      inputLots: inputLotsByBatch.get(batch.id) ?? batch.inputLots.map((row) => ({
        inventoryLotId: row.inventoryLotId,
        quantityUsed: row.quantityUsed,
      })),
    })),
    orders: rawOrders.map((order) => ({
      id: order.id,
      reference: formatSalesOrderReference(order.id),
      customerId: order.customer.id,
      customerName: order.customer.name,
      orderedAt: order.orderedAt.toISOString(),
      productIds: order.items.map((item) => item.productId),
    })),
    customers: rawCustomers,
    boms: rawBoms,
  });
}

function buildOptions(graph: TraceabilityGraph): TraceabilityEntityOption[] {
  const options: TraceabilityEntityOption[] = [];
  for (const lot of graph.lots.values()) {
    options.push({
      id: lot.id,
      type: "lot",
      label: lot.batchCode,
      sublabel: `${lot.productName} · material lot`,
    });
  }
  for (const batch of graph.batches.values()) {
    options.push({
      id: batch.id,
      type: "batch",
      label: batch.batchNumber,
      sublabel: `${batch.productName} · ${batch.qualityStatus.replaceAll("_", " ").toLowerCase()}`,
    });
  }
  for (const order of graph.orders.values()) {
    options.push({
      id: order.id,
      type: "order",
      label: order.reference,
      sublabel: `${order.customerName} · sales order`,
    });
  }
  for (const customer of graph.customers.values()) {
    options.push({
      id: customer.id,
      type: "customer",
      label: customer.name,
      sublabel: `${customer.orderIds.size} realized order${customer.orderIds.size === 1 ? "" : "s"}`,
    });
  }
  return options.slice(0, 120);
}

function resolveSelection(
  graph: TraceabilityGraph,
  filters: TraceabilityFilters
): { type: TraceabilityEntityType; id: string } | null {
  if (filters.lotId && graph.lots.has(filters.lotId)) return { type: "lot", id: filters.lotId };
  if (filters.batchId && graph.batches.has(filters.batchId)) return { type: "batch", id: filters.batchId };
  if (filters.orderId && graph.orders.has(filters.orderId)) return { type: "order", id: filters.orderId };
  if (filters.customerId && graph.customers.has(filters.customerId)) return { type: "customer", id: filters.customerId };
  if (filters.query) return resolveEntityFromQuery(graph, filters.query);
  return null;
}

export async function getTraceabilitySnapshot(
  ctx: TenantContext,
  filters: TraceabilityFilters
): Promise<TraceabilitySnapshot> {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, status: true } });
  const graph = await loadTraceabilityGraph(ctx);
  const attention = buildTraceabilityAttention(graph);
  const selection = resolveSelection(graph, filters);
  const investigation = selection ? investigateEntity(graph, selection.type, selection.id) : null;

  const partialLinks = investigation?.coverage.filter((row) => row.coverage === "PARTIAL").length ?? 0;
  const missingLinks = investigation?.coverage.filter((row) => row.coverage === "NOT_RECORDED").length ?? 0;
  const traceableLots = [...graph.lots.values()].filter((lot) => (graph.lotToBatches.get(lot.id)?.size ?? 0) > 0).length;

  let emptyReason: string | null = null;
  if (graph.lots.size === 0 && graph.batches.size === 0) {
    emptyReason = "No inventory lots or production batches are recorded for this workspace.";
  } else if (!investigation && (filters.query || filters.lotId || filters.batchId || filters.orderId || filters.customerId)) {
    emptyReason = "No traceability match for the current selection.";
  } else if (!investigation) {
    emptyReason = "Select a material lot, production batch, sales order, or customer to investigate.";
  }

  return {
    brand: tenant?.name ?? "Workspace",
    disclaimer: tenant?.status === "DEMO" ? "Demo workspace data · traceability intelligence only" : "Traceability intelligence only",
    generatedAt: new Date().toISOString(),
    query: filters.query,
    entityType: selection?.type,
    entityId: selection?.id,
    kpis: [
      { id: "lots", label: "Material lots", value: formatCount(graph.lots.size), hint: "Inventory lots in scope" },
      { id: "linked", label: "Lots with batch use", value: formatCount(traceableLots), hint: "Recorded production consumption" },
      { id: "batches", label: "Production batches", value: formatCount(graph.batches.size), hint: "Phase 33 batch records" },
      { id: "gaps", label: "Traceability gaps", value: formatCount(attention.length), hint: "Missing or partial links" },
      { id: "partial", label: "Partial links", value: formatCount(partialLinks), hint: "Current investigation" },
      { id: "missing", label: "Not recorded", value: formatCount(missingLinks), hint: "Current investigation" },
    ],
    options: buildOptions(graph),
    investigation,
    attention,
    emptyReason,
  };
}

export async function getTraceabilityAttention(ctx: TenantContext) {
  const graph = await loadTraceabilityGraph(ctx);
  return buildTraceabilityAttention(graph);
}

export async function countTraceabilityAttention(ctx: TenantContext): Promise<number> {
  const items = await getTraceabilityAttention(ctx);
  return items.length;
}

export async function assertTraceabilityEntityScope(
  ctx: TenantContext,
  entityType: TraceabilityEntityType,
  entityId: string
): Promise<void> {
  const graph = await loadTraceabilityGraph(ctx);
  if (entityType === "lot" && !graph.lots.has(entityId)) throw new ServerError("Material lot not found.", "NOT_FOUND");
  if (entityType === "batch" && !graph.batches.has(entityId)) throw new ServerError("Production batch not found.", "NOT_FOUND");
  if (entityType === "order" && !graph.orders.has(entityId)) throw new ServerError("Sales order not found.", "NOT_FOUND");
  if (entityType === "customer" && !graph.customers.has(entityId)) throw new ServerError("Customer not found.", "NOT_FOUND");
}
