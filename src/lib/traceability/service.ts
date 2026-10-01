import { computeBatchQuantities } from "@/lib/batches/service";
import type { BatchQualityStatus } from "@/lib/batches/types";
import { buildImpactSummary } from "@/lib/traceability/impact";
import type {
  TraceabilityAttentionItem,
  TraceabilityCoverageRow,
  TraceabilityEntityType,
  TraceabilityImpactRow,
  TraceabilityInvestigation,
  TraceabilityPathNode,
} from "@/lib/traceability/types";

const MAX_TRAVERSAL = 64;

export type TraceabilityGraph = {
  lots: Map<
    string,
    {
      id: string;
      batchCode: string;
      productId: string;
      productName: string;
      productSku: string;
      supplierId: string | null;
      supplierName: string | null;
      quantity: number;
      receivedAt: string | null;
      receiptReference: string | null;
    }
  >;
  batches: Map<
    string,
    {
      id: string;
      batchNumber: string;
      productId: string;
      productName: string;
      productSku: string;
      qualityStatus: BatchQualityStatus;
      plannedQuantity: number;
      producedLabel: string;
      productionOrderId: string;
      orderNumber: string;
      manufacturingCompleted: boolean;
      inputLotCount: number;
      recordedInputLotCount: number;
    }
  >;
  orders: Map<
    string,
    {
      id: string;
      reference: string;
      customerId: string;
      customerName: string;
      orderedAt: string;
      productIds: Set<string>;
    }
  >;
  customers: Map<string, { id: string; name: string; orderIds: Set<string> }>;
  lotToBatches: Map<string, Set<string>>;
  batchToLots: Map<string, Set<string>>;
  /** Phase 33 `ProductionBatchInputLot.quantityUsed`, keyed `batchId:lotId`. Null means a row exists but quantity was not recorded. */
  lotQuantityUsed: Map<string, number | null>;
  productToBatches: Map<string, Set<string>>;
  productToOrders: Map<string, Set<string>>;
  customerToOrders: Map<string, Set<string>>;
  bomByFinished: Map<string, Set<string>>;
};

export function buildTraceabilityIndexes(input: {
  lots: TraceabilityGraph["lots"] extends Map<string, infer T> ? T[] : never;
  batches: Array<{
    id: string;
    batchNumber: string;
    productId: string;
    productName: string;
    productSku: string;
    qualityStatus: BatchQualityStatus;
    plannedQuantity: number;
    producedQuantity: number | null;
    productionOrderId: string;
    orderNumber: string;
    manufacturingCompleted: boolean;
    inputLots: Array<{ inventoryLotId: string | null; quantityUsed: number | null }>;
  }>;
  orders: Array<{
    id: string;
    reference: string;
    customerId: string;
    customerName: string;
    orderedAt: string;
    productIds: string[];
  }>;
  customers: Array<{ id: string; name: string }>;
  boms: Array<{ productId: string; componentId: string }>;
}): TraceabilityGraph {
  const lots = new Map(input.lots.map((lot) => [lot.id, lot]));
  const batches = new Map(
    input.batches.map((batch) => {
      const quantities = computeBatchQuantities({
        plannedQuantity: batch.plannedQuantity,
        producedQuantity: batch.producedQuantity,
      });
      const recordedInputLotCount = batch.inputLots.filter((row) => row.inventoryLotId != null).length;
      return [
        batch.id,
        {
          id: batch.id,
          batchNumber: batch.batchNumber,
          productId: batch.productId,
          productName: batch.productName,
          productSku: batch.productSku,
          qualityStatus: batch.qualityStatus,
          plannedQuantity: batch.plannedQuantity,
          producedLabel: quantities.producedLabel,
          productionOrderId: batch.productionOrderId,
          orderNumber: batch.orderNumber,
          manufacturingCompleted: batch.manufacturingCompleted,
          inputLotCount: batch.inputLots.length,
          recordedInputLotCount,
        },
      ] as const;
    })
  );
  const orders = new Map(
    input.orders.map((order) => [
      order.id,
      {
        ...order,
        productIds: new Set(order.productIds),
      },
    ])
  );
  const customers = new Map(
    input.customers.map((customer) => [customer.id, { ...customer, orderIds: new Set<string>() }])
  );

  const lotToBatches = new Map<string, Set<string>>();
  const batchToLots = new Map<string, Set<string>>();
  const lotQuantityUsed = new Map<string, number | null>();
  const productToBatches = new Map<string, Set<string>>();
  const productToOrders = new Map<string, Set<string>>();
  const customerToOrders = new Map<string, Set<string>>();
  const bomByFinished = new Map<string, Set<string>>();

  for (const batch of input.batches) {
    const batchSet = productToBatches.get(batch.productId) ?? new Set<string>();
    batchSet.add(batch.id);
    productToBatches.set(batch.productId, batchSet);

    const lotIds = new Set<string>();
    const usage = new Map<string, { sum: number; unknown: boolean }>();
    for (const row of batch.inputLots) {
      if (!row.inventoryLotId) continue;
      lotIds.add(row.inventoryLotId);
      const reverse = lotToBatches.get(row.inventoryLotId) ?? new Set<string>();
      reverse.add(batch.id);
      lotToBatches.set(row.inventoryLotId, reverse);
      const current = usage.get(row.inventoryLotId) ?? { sum: 0, unknown: false };
      if (row.quantityUsed == null) current.unknown = true;
      else current.sum += row.quantityUsed;
      usage.set(row.inventoryLotId, current);
    }
    for (const [lotId, current] of usage) {
      lotQuantityUsed.set(`${batch.id}:${lotId}`, current.unknown ? null : current.sum);
    }
    batchToLots.set(batch.id, lotIds);
  }

  for (const order of input.orders) {
    const customer = customers.get(order.customerId);
    if (customer) {
      customer.orderIds.add(order.id);
      const customerOrders = customerToOrders.get(order.customerId) ?? new Set<string>();
      customerOrders.add(order.id);
      customerToOrders.set(order.customerId, customerOrders);
    }
    for (const productId of order.productIds) {
      const orderSet = productToOrders.get(productId) ?? new Set<string>();
      orderSet.add(order.id);
      productToOrders.set(productId, orderSet);
    }
  }

  for (const row of input.boms) {
    const components = bomByFinished.get(row.productId) ?? new Set<string>();
    components.add(row.componentId);
    bomByFinished.set(row.productId, components);
  }

  return {
    lots,
    batches,
    orders,
    customers,
    lotToBatches,
    batchToLots,
    lotQuantityUsed,
    productToBatches,
    productToOrders,
    customerToOrders,
    bomByFinished,
  };
}

function quantityUsedNote(graph: TraceabilityGraph, batchId: string, lotId: string): string {
  const key = `${batchId}:${lotId}`;
  if (!graph.lotQuantityUsed.has(key)) return "";
  const quantity = graph.lotQuantityUsed.get(key);
  return quantity == null ? "quantity NOT_RECORDED" : `used ${quantity}`;
}

function uniqueNodes(nodes: TraceabilityPathNode[]): TraceabilityPathNode[] {
  const seen = new Set<string>();
  const output: TraceabilityPathNode[] = [];
  for (const node of nodes) {
    const key = `${node.kind}:${node.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(node);
    if (output.length >= MAX_TRAVERSAL) break;
  }
  return output;
}

function ordersForProduct(graph: TraceabilityGraph, productId: string): string[] {
  return [...(graph.productToOrders.get(productId) ?? [])].slice(0, MAX_TRAVERSAL);
}

function batchesForProduct(graph: TraceabilityGraph, productId: string): string[] {
  return [...(graph.productToBatches.get(productId) ?? [])].slice(0, MAX_TRAVERSAL);
}

function buildCoverageRows(path: TraceabilityPathNode[]): TraceabilityCoverageRow[] {
  const rows: TraceabilityCoverageRow[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const prev = path[index - 1]!;
    const next = path[index]!;
    const coverage = next.coverage;
    rows.push({
      id: `${prev.kind}-${next.kind}`,
      link: `${prev.label} → ${next.label}`,
      coverage,
      note:
        coverage === "NOT_RECORDED"
          ? "Relationship not recorded in this workspace."
          : coverage === "PARTIAL"
            ? "Relationship is inferred from product match — not confirmed batch allocation."
            : "Recorded relationship.",
    });
  }
  return rows;
}

function impactRowsFromPath(path: TraceabilityPathNode[]): TraceabilityImpactRow[] {
  return path
    .filter((node) => node.kind !== "supplier")
    .map((node) => ({
      id: node.id,
      kind: node.kind.replace("_", " "),
      label: node.label,
      detail: node.sublabel ?? "—",
      coverage: node.coverage,
      href: node.href,
    }));
}

export function investigateLot(graph: TraceabilityGraph, lotId: string): TraceabilityInvestigation | null {
  const lot = graph.lots.get(lotId);
  if (!lot) return null;

  const batchIds = [...(graph.lotToBatches.get(lotId) ?? [])];
  const path: TraceabilityPathNode[] = [
    lot.supplierName
      ? {
          id: lot.supplierId ?? `supplier-${lot.id}`,
          kind: "supplier",
          label: lot.supplierName,
          coverage: "TRACEABLE",
          href: lot.supplierId ? `/suppliers` : undefined,
        }
      : {
          id: `supplier-missing-${lot.id}`,
          kind: "supplier",
          label: "Supplier not recorded",
          coverage: "NOT_RECORDED",
        },
    {
      id: lot.id,
      kind: "material_lot",
      label: lot.batchCode,
      sublabel: `${lot.productName} · ${lot.quantity.toLocaleString("en-KE")} on hand`,
      coverage: "TRACEABLE",
      href: `/inventory?material=${lot.productId}`,
      entityId: lot.id,
    },
  ];

  const batches = batchIds.map((id) => graph.batches.get(id)).filter(Boolean);
  for (const batch of batches) {
    if (!batch) continue;
    const used = quantityUsedNote(graph, batch.id, lot.id);
    path.push({
      id: batch.id,
      kind: "production_batch",
      label: batch.batchNumber,
      sublabel: `${batch.productName} · ${batch.qualityStatus.replaceAll("_", " ").toLowerCase()}${used ? ` · ${used}` : ""}`,
      coverage: graph.batchToLots.get(batch.id)?.has(lot.id) ? "TRACEABLE" : "NOT_RECORDED",
      href: `/batches?batch=${batch.id}`,
      entityId: batch.id,
    });
    path.push({
      id: `finished-${batch.id}`,
      kind: "finished_product",
      label: batch.productName,
      sublabel: `Batch ${batch.batchNumber} · produced ${batch.producedLabel}`,
      coverage: "TRACEABLE",
      href: `/batches?batch=${batch.id}`,
    });

    const orderIds = ordersForProduct(graph, batch.productId);
    if (orderIds.length === 0) {
      path.push({
        id: `orders-none-${batch.id}`,
        kind: "sales_order",
        label: "No matching sales orders",
        coverage: "NOT_RECORDED",
      });
    } else {
      for (const orderId of orderIds.slice(0, 3)) {
        const order = graph.orders.get(orderId);
        if (!order) continue;
        path.push({
          id: order.id,
          kind: "sales_order",
          label: order.reference,
          sublabel: `${order.customerName} · ${order.orderedAt.slice(0, 10)}`,
          coverage: "PARTIAL",
          href: `/traceability?order=${order.id}`,
        });
        path.push({
          id: order.customerId,
          kind: "customer",
          label: order.customerName,
          sublabel: "Product match only — batch allocation not recorded",
          coverage: "PARTIAL",
          href: `/traceability?customer=${order.customerId}`,
        });
      }
    }
  }

  if (batchIds.length === 0) {
    path.push({
      id: `batch-none-${lot.id}`,
      kind: "production_batch",
      label: "Production consumption not recorded",
      coverage: "NOT_RECORDED",
    });
  }

  const uniquePath = uniqueNodes(path);
  const coverage = buildCoverageRows(uniquePath);
  const orderIds = new Set<string>();
  const customerIds = new Set<string>();
  for (const batch of batches) {
    if (!batch) continue;
    for (const orderId of ordersForProduct(graph, batch.productId)) {
      orderIds.add(orderId);
      const order = graph.orders.get(orderId);
      if (order) customerIds.add(order.customerId);
    }
  }

  const quantityUsed = batchIds
    .flatMap((batchId) => {
      const batch = graph.batches.get(batchId);
      return batch ? [batch.producedLabel] : [];
    })
    .filter((value) => value !== "NOT_RECORDED");

  return {
    entityType: "lot",
    entityId: lot.id,
    entityLabel: lot.batchCode,
    direction: "forward",
    path: uniquePath,
    coverage,
    impact: buildImpactSummary({
      anchorLabel: lot.batchCode,
      path: uniquePath,
      coverage,
      batchCount: batchIds.length,
      lotCount: 1,
      orderCount: orderIds.size,
      customerCount: customerIds.size,
      quantityLabel: quantityUsed.length > 0 ? quantityUsed.join(", ") : "CONSUMPTION NOT RECORDED",
      rows: impactRowsFromPath(uniquePath),
      hasKnownLinks: batchIds.length > 0 || lot.supplierName != null,
    }),
    exceptions:
      batchIds.length === 0
        ? ["Material lot received but no production consumption recorded."]
        : orderIds.size > 0
          ? ["Downstream customer exposure is product-matched only — batch allocation not recorded."]
          : [],
  };
}

export function investigateBatch(graph: TraceabilityGraph, batchId: string): TraceabilityInvestigation | null {
  const batch = graph.batches.get(batchId);
  if (!batch) return null;

  const lotIds = [...(graph.batchToLots.get(batchId) ?? [])];
  const path: TraceabilityPathNode[] = [];

  if (lotIds.length === 0) {
    path.push({
      id: `inputs-none-${batch.id}`,
      kind: "material_lot",
      label: "Input lot consumption not recorded",
      coverage: "NOT_RECORDED",
    });
  } else {
    for (const lotId of lotIds) {
      const lot = graph.lots.get(lotId);
      if (!lot) continue;
      if (lot.supplierName) {
        path.push({
          id: lot.supplierId ?? `supplier-${lot.id}`,
          kind: "supplier",
          label: lot.supplierName,
          coverage: "TRACEABLE",
          href: `/suppliers`,
        });
      }
      path.push({
        id: lot.id,
        kind: "material_lot",
        label: lot.batchCode,
        sublabel: [lot.productName, quantityUsedNote(graph, batch.id, lot.id)].filter(Boolean).join(" · "),
        coverage: "TRACEABLE",
        href: `/traceability?lot=${lot.id}`,
        entityId: lot.id,
      });
    }
    if (batch.inputLotCount > batch.recordedInputLotCount) {
      path.push({
        id: `inputs-unlinked-${batch.id}`,
        kind: "material_lot",
        label: "Input row not linked to an inventory lot",
        coverage: "NOT_RECORDED",
      });
    }
  }

  path.push({
    id: batch.id,
    kind: "production_batch",
    label: batch.batchNumber,
    sublabel: `${batch.orderNumber} · ${batch.qualityStatus.replaceAll("_", " ").toLowerCase()}`,
    coverage: "TRACEABLE",
    href: `/batches?batch=${batch.id}`,
    entityId: batch.id,
  });
  path.push({
    id: `finished-${batch.id}`,
    kind: "finished_product",
    label: batch.productName,
    sublabel: `Planned ${batch.plannedQuantity.toLocaleString("en-KE")} · produced ${batch.producedLabel}`,
    coverage: "TRACEABLE",
    href: `/batches?batch=${batch.id}`,
  });

  const orderIds = ordersForProduct(graph, batch.productId);
  if (orderIds.length === 0) {
    path.push({
      id: `orders-none-${batch.id}`,
      kind: "sales_order",
      label: "No matching sales orders",
      coverage: "NOT_RECORDED",
    });
  } else {
    for (const orderId of orderIds.slice(0, 3)) {
      const order = graph.orders.get(orderId);
      if (!order) continue;
      path.push({
        id: order.id,
        kind: "sales_order",
        label: order.reference,
        sublabel: order.customerName,
        coverage: "PARTIAL",
        href: `/traceability?order=${order.id}`,
      });
      path.push({
        id: order.customerId,
        kind: "customer",
        label: order.customerName,
        coverage: "PARTIAL",
        href: `/traceability?customer=${order.customerId}`,
      });
    }
  }

  const uniquePath = uniqueNodes(path);
  const coverage = buildCoverageRows(uniquePath);
  const customerIds = new Set<string>();
  for (const orderId of orderIds) {
    const order = graph.orders.get(orderId);
    if (order) customerIds.add(order.customerId);
  }

  const exceptions: string[] = [];
  if (batch.manufacturingCompleted && batch.recordedInputLotCount === 0) {
    exceptions.push(`Batch ${batch.batchNumber} has no recorded input-lot consumption.`);
  }
  if (orderIds.length > 0) {
    exceptions.push("Batch-to-order allocation not recorded.");
  }

  return {
    entityType: "batch",
    entityId: batch.id,
    entityLabel: batch.batchNumber,
    direction: "forward",
    path: uniquePath,
    coverage,
    impact: buildImpactSummary({
      anchorLabel: batch.batchNumber,
      path: uniquePath,
      coverage,
      batchCount: 1,
      lotCount: lotIds.length,
      orderCount: orderIds.length,
      customerCount: customerIds.size,
      quantityLabel: batch.producedLabel === "NOT_RECORDED" ? "NOT_RECORDED" : batch.producedLabel,
      rows: impactRowsFromPath(uniquePath),
      hasKnownLinks: true,
    }),
    exceptions,
  };
}

export function investigateOrder(graph: TraceabilityGraph, orderId: string): TraceabilityInvestigation | null {
  const order = graph.orders.get(orderId);
  if (!order) return null;

  const path: TraceabilityPathNode[] = [
    {
      id: order.customerId,
      kind: "customer",
      label: order.customerName,
      coverage: "TRACEABLE",
      href: `/traceability?customer=${order.customerId}`,
    },
    {
      id: order.id,
      kind: "sales_order",
      label: order.reference,
      sublabel: order.orderedAt.slice(0, 10),
      coverage: "TRACEABLE",
      href: `/traceability?order=${order.id}`,
    },
  ];

  const batchIds = new Set<string>();
  for (const productId of order.productIds) {
    for (const batchId of batchesForProduct(graph, productId)) {
      batchIds.add(batchId);
      const batch = graph.batches.get(batchId);
      if (!batch) continue;
      path.push({
        id: batch.id,
        kind: "production_batch",
        label: batch.batchNumber,
        sublabel: `${batch.productName} · product match only`,
        coverage: "PARTIAL",
        href: `/batches?batch=${batch.id}`,
      });
      path.push({
        id: `finished-${batch.id}`,
        kind: "finished_product",
        label: batch.productName,
        coverage: "PARTIAL",
        href: `/batches?batch=${batch.id}`,
      });

      const lotIds = [...(graph.batchToLots.get(batch.id) ?? [])];
      if (lotIds.length === 0) {
        path.push({
          id: `lot-none-${batch.id}`,
          kind: "material_lot",
          label: "Input lots not recorded",
          coverage: "NOT_RECORDED",
        });
      } else {
        for (const lotId of lotIds.slice(0, 2)) {
          const lot = graph.lots.get(lotId);
          if (!lot) continue;
          path.push({
            id: lot.id,
            kind: "material_lot",
            label: lot.batchCode,
            sublabel: [lot.productName, quantityUsedNote(graph, batch.id, lotId)].filter(Boolean).join(" · "),
            coverage: "TRACEABLE",
            href: `/traceability?lot=${lot.id}`,
          });
          if (lot.supplierName) {
            path.push({
              id: lot.supplierId ?? `supplier-${lot.id}`,
              kind: "supplier",
              label: lot.supplierName,
              coverage: "TRACEABLE",
            });
          }
        }
        if (batch.inputLotCount > batch.recordedInputLotCount) {
          path.push({
            id: `inputs-unlinked-${batch.id}`,
            kind: "material_lot",
            label: "Input row not linked to an inventory lot",
            coverage: "NOT_RECORDED",
          });
        }
      }
    }
  }

  const uniquePath = uniqueNodes(path);
  const coverage = buildCoverageRows(uniquePath);
  const lotIds = new Set<string>();
  for (const batchId of batchIds) {
    for (const lotId of graph.batchToLots.get(batchId) ?? []) lotIds.add(lotId);
  }

  return {
    entityType: "order",
    entityId: order.id,
    entityLabel: order.reference,
    direction: "reverse",
    path: uniquePath,
    coverage,
    impact: buildImpactSummary({
      anchorLabel: order.reference,
      path: uniquePath,
      coverage,
      batchCount: batchIds.size,
      lotCount: lotIds.size,
      orderCount: 1,
      customerCount: 1,
      quantityLabel: "Order quantities recorded — batch allocation not recorded",
      rows: impactRowsFromPath(uniquePath),
      hasKnownLinks: batchIds.size > 0,
    }),
    exceptions: ["Batch-to-order allocation not recorded."],
  };
}

export function investigateCustomer(graph: TraceabilityGraph, customerId: string): TraceabilityInvestigation | null {
  const customer = graph.customers.get(customerId);
  if (!customer) return null;

  const path: TraceabilityPathNode[] = [
    {
      id: customer.id,
      kind: "customer",
      label: customer.name,
      coverage: "TRACEABLE",
      href: `/traceability?customer=${customer.id}`,
    },
  ];

  const orderIds = [...customer.orderIds].slice(0, 5);
  const batchIds = new Set<string>();
  for (const orderId of orderIds) {
    const order = graph.orders.get(orderId);
    if (!order) continue;
    path.push({
      id: order.id,
      kind: "sales_order",
      label: order.reference,
      sublabel: order.orderedAt.slice(0, 10),
      coverage: "TRACEABLE",
      href: `/traceability?order=${order.id}`,
    });
    for (const productId of order.productIds) {
      for (const batchId of batchesForProduct(graph, productId)) {
        batchIds.add(batchId);
        const batch = graph.batches.get(batchId);
        if (!batch) continue;
        path.push({
          id: batch.id,
          kind: "production_batch",
          label: batch.batchNumber,
          sublabel: `${batch.productName} · product match only`,
          coverage: "PARTIAL",
          href: `/batches?batch=${batch.id}`,
        });
      }
    }
  }

  const uniquePath = uniqueNodes(path);
  const coverage = buildCoverageRows(uniquePath);

  return {
    entityType: "customer",
    entityId: customer.id,
    entityLabel: customer.name,
    direction: "reverse",
    path: uniquePath,
    coverage,
    impact: buildImpactSummary({
      anchorLabel: customer.name,
      path: uniquePath,
      coverage,
      batchCount: batchIds.size,
      lotCount: 0,
      orderCount: orderIds.length,
      customerCount: 1,
      quantityLabel: "Customer exposure by product match — batch allocation not recorded",
      rows: impactRowsFromPath(uniquePath),
      hasKnownLinks: orderIds.length > 0,
    }),
    exceptions: orderIds.length > 0 ? ["Batch-to-order allocation not recorded."] : ["No realized sales orders for this customer."],
  };
}

export function investigateEntity(
  graph: TraceabilityGraph,
  entityType: TraceabilityEntityType,
  entityId: string
): TraceabilityInvestigation | null {
  if (entityType === "lot") return investigateLot(graph, entityId);
  if (entityType === "batch") return investigateBatch(graph, entityId);
  if (entityType === "order") return investigateOrder(graph, entityId);
  return investigateCustomer(graph, entityId);
}

export function buildTraceabilityAttention(graph: TraceabilityGraph): TraceabilityAttentionItem[] {
  const items: TraceabilityAttentionItem[] = [];

  const batchesMissingInputs = [...graph.batches.values()].filter(
    (batch) => batch.manufacturingCompleted && batch.recordedInputLotCount === 0
  );
  if (batchesMissingInputs.length === 1) {
    const batch = batchesMissingInputs[0]!;
    items.push({
      id: `trace-input-${batch.id}`,
      severity: "WARNING",
      title: `Batch ${batch.batchNumber} has no recorded input-lot consumption.`,
      detail: "Production is complete but material genealogy is incomplete.",
      href: `/traceability?batch=${batch.id}`,
    });
  } else if (batchesMissingInputs.length > 1) {
    items.push({
      id: "trace-input-many",
      severity: "HIGH",
      title: `${batchesMissingInputs.length} completed batches have no recorded input-lot linkage.`,
      detail: "Open traceability to review missing material genealogy.",
      href: "/traceability",
    });
  }

  const unreceivedLots = [...graph.lots.values()].filter((lot) => !(graph.lotToBatches.get(lot.id)?.size ?? 0));
  if (unreceivedLots.length >= 3) {
    items.push({
      id: "trace-lot-idle",
      severity: "WARNING",
      title: `${unreceivedLots.length} material lots have no recorded production consumption.`,
      detail: "Lots may be unused or consumption was not recorded.",
      href: "/traceability",
    });
  }

  const partialExposure = [...graph.batches.values()].filter(
    (batch) => batch.qualityStatus === "RELEASED" && (graph.productToOrders.get(batch.productId)?.size ?? 0) > 0
  );
  if (partialExposure.length === 1) {
    const batch = partialExposure[0]!;
    items.push({
      id: `trace-allocation-${batch.id}`,
      severity: "HIGH",
      title: `Batch ${batch.batchNumber} has downstream orders but batch allocation is incomplete.`,
      detail: "Customer exposure is product-matched only — not confirmed batch genealogy.",
      href: `/traceability?batch=${batch.id}`,
    });
  } else if (partialExposure.length > 1) {
    items.push({
      id: "trace-allocation-many",
      severity: "HIGH",
      title: `${partialExposure.length} released batches have downstream orders without batch allocation.`,
      detail: "Customer exposure is product-matched only — not confirmed batch genealogy.",
      href: "/traceability",
    });
  }

  return items;
}

export function resolveEntityFromQuery(
  graph: TraceabilityGraph,
  query: string
): { type: TraceabilityEntityType; id: string } | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  for (const lot of graph.lots.values()) {
    if (lot.batchCode.toLowerCase() === normalized || lot.batchCode.toLowerCase().includes(normalized)) {
      return { type: "lot", id: lot.id };
    }
  }
  for (const batch of graph.batches.values()) {
    if (batch.batchNumber.toLowerCase() === normalized || batch.batchNumber.toLowerCase().includes(normalized)) {
      return { type: "batch", id: batch.id };
    }
  }
  for (const order of graph.orders.values()) {
    if (order.reference.toLowerCase() === normalized || order.reference.toLowerCase().includes(normalized)) {
      return { type: "order", id: order.id };
    }
  }
  for (const customer of graph.customers.values()) {
    if (customer.name.toLowerCase() === normalized || customer.name.toLowerCase().includes(normalized)) {
      return { type: "customer", id: customer.id };
    }
  }
  for (const batch of graph.batches.values()) {
    if (batch.productName.toLowerCase().includes(normalized) || batch.productSku.toLowerCase().includes(normalized)) {
      return { type: "batch", id: batch.id };
    }
  }
  return null;
}
