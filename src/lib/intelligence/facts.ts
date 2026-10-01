import type {
  IntelligenceConfidence,
  IntelligenceDomain,
  IntelligenceSeverity,
  OperationalFact,
} from "@/lib/intelligence/types";

export type ProductionFactInput = {
  id: string;
  orderNumber: string;
  productName: string;
  displayStatus: string;
  dueDate: string;
  materialReadiness: string;
  materialShortageCount: number;
  materialAffected: string[];
  capacityState: string;
  conflictCount: number;
  priority: string;
};

export type WorkstationFactInput = {
  id: string;
  name: string;
  utilization: number;
  capacityState: string;
};

export type MaterialFactInput = {
  productId: string;
  sku: string;
  name: string;
  shortage: boolean;
  shortageStatus: string;
  risk: string;
  netRequirement: number;
  projectedAvailable: number;
  grossRequirement: number;
  earliestShortageDate: string | null;
  affectedOrders: Array<{ id: string; orderNumber: string; productName: string }>;
};

export type ProcurementFactInput = {
  pendingReview: number;
  awaitingEvaluation: number;
  pendingPurchaseOrders: number;
  awaitingReceipt: number;
};

export type SupplierFactInput = {
  supplierId: string;
  name: string;
  band: string;
  attentionFlags: string[];
  poCount: number;
};

export type QualityFactInput = {
  id: string;
  reference: string;
  title: string;
  severity: string;
  status: string;
  dueState: string;
  ownerName: string | null;
  entityLabel: string;
  batchId: string | null;
  batchNumber: string | null;
  batchQualityStatus: string | null;
};

export type BatchFactInput = {
  id: string;
  batchNumber: string;
  productName: string;
  qualityStatus: string;
  manufacturingStatus: string;
  holdReason: string | null;
  orderNumber: string;
};

export type TraceabilityFactInput = {
  id: string;
  severity: string;
  title: string;
  detail: string;
  href: string;
};

export type IntelligenceFactSources = {
  productionOrders?: ProductionFactInput[];
  workstations?: WorkstationFactInput[];
  materials?: MaterialFactInput[];
  procurement?: ProcurementFactInput;
  suppliers?: SupplierFactInput[];
  qualityExceptions?: QualityFactInput[];
  batches?: BatchFactInput[];
  traceability?: TraceabilityFactInput[];
  revenueAtRisk?: boolean;
};

function mapSeverity(value: string): IntelligenceSeverity {
  if (value === "CRITICAL" || value === "DANGER") return "CRITICAL";
  if (value === "HIGH" || value === "WARNING") return "HIGH";
  if (value === "MEDIUM" || value === "WATCH") return "MEDIUM";
  return "LOW";
}

function fact(input: OperationalFact): OperationalFact {
  return input;
}

export function buildProductionFacts(orders: ProductionFactInput[]): OperationalFact[] {
  return orders
    .filter((order) => order.displayStatus === "AT_RISK" || order.materialShortageCount > 0 || order.conflictCount > 0)
    .map((order) => {
      const materialDriven = order.materialShortageCount > 0 || order.materialReadiness === "SHORTAGE";
      const reasons: string[] = [];
      if (materialDriven) {
        reasons.push(
          `Projected available material falls below required quantity before scheduled production (${order.materialShortageCount} shortage${order.materialShortageCount === 1 ? "" : "s"}).`
        );
      }
      if (order.conflictCount > 0) reasons.push(`${order.conflictCount} workstation scheduling conflict${order.conflictCount === 1 ? "" : "s"}.`);
      if (order.capacityState === "DANGER") reasons.push("Assigned workstation is above the 95% utilization danger threshold.");
      if (reasons.length === 0) reasons.push(`Order status is ${order.displayStatus.replace(/_/g, " ").toLowerCase()}.`);
      return fact({
        id: `prod-${order.id}`,
        type: "PRODUCTION_RISK",
        severity: order.priority === "CRITICAL" || materialDriven ? "CRITICAL" : "HIGH",
        confidence: materialDriven ? "KNOWN" : "PARTIAL",
        domain: "production",
        title: `Production order ${order.orderNumber} is at risk`,
        entityType: "PRODUCTION_ORDER",
        entityId: order.id,
        entityLabel: order.orderNumber,
        reason: reasons[0]!,
        evidence: [
          { label: "Product", value: order.productName },
          { label: "Due", value: order.dueDate.slice(0, 10) },
          { label: "Material readiness", value: order.materialReadiness },
          ...(order.materialAffected.length
            ? [{ label: "Materials", value: order.materialAffected.slice(0, 3).join(", ") }]
            : []),
        ],
        relatedDomains: materialDriven ? ["materials", "production"] : ["production"],
        href: `/operations?order=${order.id}`,
      });
    });
}

export function buildCapacityFacts(workstations: WorkstationFactInput[]): OperationalFact[] {
  return workstations
    .filter((row) => row.capacityState === "DANGER" || row.utilization >= 95)
    .map((row) =>
      fact({
        id: `cap-${row.id}`,
        type: "CAPACITY_RISK",
        severity: "HIGH",
        confidence: "KNOWN",
        domain: "production",
        title: `${row.name} exceeds the 95% utilization danger threshold`,
        entityType: "WORKSTATION",
        entityId: row.id,
        entityLabel: row.name,
        reason: `Finite-capacity utilization is ${Math.round(row.utilization)}%.`,
        evidence: [{ label: "Utilization", value: `${Math.round(row.utilization)}%` }],
        relatedDomains: ["production"],
        href: "/operations?view=capacity",
      })
    );
}

export function buildMaterialFacts(materials: MaterialFactInput[]): OperationalFact[] {
  return materials
    .filter((row) => row.shortage || row.shortageStatus === "AT_RISK" || row.risk === "CRITICAL" || row.risk === "HIGH")
    .map((row) => {
      const shortage = row.shortage || row.shortageStatus === "SHORTAGE";
      const orders = row.affectedOrders.slice(0, 5);
      return fact({
        id: `mat-${row.productId}`,
        type: shortage ? "MATERIAL_SHORTAGE" : "MATERIAL_AT_RISK",
        severity: shortage || row.risk === "CRITICAL" ? "CRITICAL" : "HIGH",
        confidence: "KNOWN",
        domain: "materials",
        title: shortage
          ? `${row.name} has a confirmed MRP shortage against production demand`
          : `${row.name} is at material risk before planned production`,
        entityType: "PRODUCT",
        entityId: row.productId,
        entityLabel: row.sku,
        reason: shortage
          ? `Projected available ${Math.round(row.projectedAvailable)} is below gross requirement ${Math.round(row.grossRequirement)} (net ${Math.round(row.netRequirement)}).`
          : `Coverage is tight relative to open production demand.`,
        evidence: [
          { label: "SKU", value: row.sku },
          { label: "Net requirement", value: String(Math.round(row.netRequirement)) },
          { label: "Orders affected", value: String(row.affectedOrders.length) },
          ...(row.earliestShortageDate ? [{ label: "Shortage date", value: row.earliestShortageDate.slice(0, 10) }] : []),
          ...(orders.length ? [{ label: "Orders", value: orders.map((order) => order.orderNumber).join(", ") }] : []),
        ],
        relatedDomains: ["materials", "production", "procurement"],
        href: `/materials?material=${row.productId}&view=shortages`,
      });
    });
}

export function buildProcurementFacts(input: ProcurementFactInput): OperationalFact[] {
  const facts: OperationalFact[] = [];
  if (input.pendingReview > 0) {
    facts.push(
      fact({
        id: "proc-review",
        type: "PROCUREMENT_RISK",
        severity: input.pendingReview >= 3 ? "HIGH" : "MEDIUM",
        confidence: "KNOWN",
        domain: "procurement",
        title: `${input.pendingReview} procurement requisition${input.pendingReview === 1 ? "" : "s"} await review`,
        entityType: "PROCUREMENT_REQUISITION",
        entityId: null,
        entityLabel: "Requisitions",
        reason: "Draft requisitions remain unreviewed, so material cover cannot close through purchasing.",
        evidence: [{ label: "Pending review", value: String(input.pendingReview) }],
        relatedDomains: ["procurement", "materials"],
        href: "/procurement?view=needs-review",
      })
    );
  }
  if (input.awaitingEvaluation > 0) {
    facts.push(
      fact({
        id: "proc-rfq",
        type: "PROCUREMENT_RISK",
        severity: "HIGH",
        confidence: "KNOWN",
        domain: "procurement",
        title: `${input.awaitingEvaluation} procurement RFQ${input.awaitingEvaluation === 1 ? "" : "s"} await evaluation`,
        entityType: "PROCUREMENT_RFQ",
        entityId: null,
        entityLabel: "RFQs",
        reason: "Supplier responses are recorded but no award decision has been made.",
        evidence: [{ label: "Awaiting evaluation", value: String(input.awaitingEvaluation) }],
        relatedDomains: ["procurement", "suppliers"],
        href: "/rfqs",
      })
    );
  }
  if (input.pendingPurchaseOrders > 0) {
    facts.push(
      fact({
        id: "proc-po",
        type: "PROCUREMENT_RISK",
        severity: "MEDIUM",
        confidence: "KNOWN",
        domain: "procurement",
        title: `${input.pendingPurchaseOrders} purchase order${input.pendingPurchaseOrders === 1 ? "" : "s"} pending approval`,
        entityType: "PURCHASE_ORDER",
        entityId: null,
        entityLabel: "Purchase orders",
        reason: "Approved purchasing cannot start until a manager decision is recorded.",
        evidence: [{ label: "Pending approval", value: String(input.pendingPurchaseOrders) }],
        relatedDomains: ["procurement"],
        href: "/purchase-orders?view=pending",
      })
    );
  }
  if (input.awaitingReceipt > 0) {
    facts.push(
      fact({
        id: "proc-recv",
        type: "DELIVERY_RISK",
        severity: "HIGH",
        confidence: "KNOWN",
        domain: "procurement",
        title: `${input.awaitingReceipt} purchase order${input.awaitingReceipt === 1 ? "" : "s"} awaiting receipt`,
        entityType: "INVENTORY_RECEIPT",
        entityId: null,
        entityLabel: "Receiving",
        reason: "Open PO quantity remains unreceived, so inventory and material cover are still outstanding.",
        evidence: [{ label: "Awaiting receipt", value: String(input.awaitingReceipt) }],
        relatedDomains: ["procurement", "materials", "production"],
        href: "/receiving?view=awaiting",
      })
    );
  }
  return facts;
}

export function buildSupplierFacts(suppliers: SupplierFactInput[]): OperationalFact[] {
  return suppliers
    .filter((row) => row.band === "RISK" || row.attentionFlags.length > 0)
    .slice(0, 8)
    .map((row) =>
      fact({
        id: `sup-${row.supplierId}`,
        type: "SUPPLIER_RISK",
        severity: row.band === "RISK" ? "HIGH" : "MEDIUM",
        confidence: row.attentionFlags.length ? "KNOWN" : "PARTIAL",
        domain: "suppliers",
        title: `${row.name} requires supplier performance attention`,
        entityType: "SUPPLIER",
        entityId: row.supplierId,
        entityLabel: row.name,
        reason: row.attentionFlags[0] ?? `Performance band is ${row.band}.`,
        evidence: [
          { label: "Band", value: row.band },
          { label: "Open POs", value: String(row.poCount) },
          ...row.attentionFlags.slice(0, 2).map((flag, index) => ({ label: `Flag ${index + 1}`, value: flag })),
        ],
        relatedDomains: ["suppliers", "procurement", "materials"],
        href: `/supplier-performance?supplier=${row.supplierId}`,
      })
    );
}

export function buildQualityFacts(rows: QualityFactInput[]): OperationalFact[] {
  return rows
    .filter((row) => row.status === "OPEN" || row.status === "INVESTIGATING" || row.status === "ACTION_REQUIRED")
    .filter((row) => row.severity === "CRITICAL" || row.severity === "HIGH" || row.dueState === "OVERDUE")
    .map((row) => {
      const overdue = row.dueState === "OVERDUE";
      return fact({
        id: `qual-${row.id}`,
        type: row.batchId ? "QUALITY_IMPACT" : "QUALITY_EXCEPTION",
        severity: row.severity === "CRITICAL" ? "CRITICAL" : overdue ? "HIGH" : mapSeverity(row.severity),
        confidence: "KNOWN",
        domain: "quality",
        title: overdue
          ? `Quality exception ${row.reference} is overdue`
          : `${row.severity.toLowerCase()} quality exception ${row.reference} is unresolved`,
        entityType: "QUALITY_EXCEPTION",
        entityId: row.id,
        entityLabel: row.reference,
        reason: row.batchId
          ? `${row.title} is linked to batch ${row.batchNumber ?? row.entityLabel}${row.batchQualityStatus ? ` (${row.batchQualityStatus.replace(/_/g, " ")})` : ""}.`
          : `${row.title}. Owner: ${row.ownerName ?? "UNASSIGNED"}.`,
        evidence: [
          { label: "Status", value: row.status },
          { label: "Entity", value: row.entityLabel },
          { label: "Due", value: row.dueState.replace(/_/g, " ") },
        ],
        relatedDomains: row.batchId ? ["quality", "batches", "traceability", "production"] : ["quality"],
        href: `/quality?exception=${row.id}`,
      });
    });
}

export function buildBatchFacts(rows: BatchFactInput[]): OperationalFact[] {
  return rows
    .filter((row) => row.qualityStatus === "ON_HOLD" || row.qualityStatus === "PENDING_REVIEW")
    .map((row) =>
      fact({
        id: `batch-${row.id}`,
        type: "BATCH_HOLD",
        severity: row.qualityStatus === "ON_HOLD" ? "HIGH" : "MEDIUM",
        confidence: "KNOWN",
        domain: "batches",
        title:
          row.qualityStatus === "ON_HOLD"
            ? `Batch ${row.batchNumber} is on quality hold`
            : `Batch ${row.batchNumber} awaits quality review`,
        entityType: "PRODUCTION_BATCH",
        entityId: row.id,
        entityLabel: row.batchNumber,
        reason:
          row.qualityStatus === "ON_HOLD"
            ? row.holdReason
              ? `Hold reason recorded: ${row.holdReason}. Release is a human quality decision.`
              : "Quality hold is recorded. Release is a human quality decision."
            : "Production is complete and a quality decision has not been recorded.",
        evidence: [
          { label: "Product", value: row.productName },
          { label: "Order", value: row.orderNumber },
          { label: "Quality", value: row.qualityStatus.replace(/_/g, " ") },
        ],
        relatedDomains: ["batches", "quality", "production"],
        href: `/batches?batch=${row.id}`,
      })
    );
}

export function buildTraceabilityFacts(rows: TraceabilityFactInput[]): OperationalFact[] {
  return rows.slice(0, 6).map((row) =>
    fact({
      id: `trace-${row.id}`,
      type: row.title.toLowerCase().includes("customer") || row.title.toLowerCase().includes("order")
        ? "CUSTOMER_IMPACT"
        : "TRACEABILITY_IMPACT",
      severity: mapSeverity(row.severity),
      confidence: "PARTIAL",
      domain: "traceability",
      title: row.title,
      entityType: "TRACEABILITY",
      entityId: null,
      entityLabel: "Traceability",
      reason: `${row.detail} Batch-to-order allocation is not recorded; customer exposure is product-matched only.`,
      evidence: [{ label: "Limitation", value: "INSUFFICIENT_DATA for confirmed batch-level customer allocation" }],
      relatedDomains: ["traceability", "quality", "commercial"],
      href: row.href,
    })
  );
}

export function collectOperationalFacts(sources: IntelligenceFactSources): OperationalFact[] {
  return [
    ...buildProductionFacts(sources.productionOrders ?? []),
    ...buildCapacityFacts(sources.workstations ?? []),
    ...buildMaterialFacts(sources.materials ?? []),
    ...(sources.procurement ? buildProcurementFacts(sources.procurement) : []),
    ...buildSupplierFacts(sources.suppliers ?? []),
    ...buildQualityFacts(sources.qualityExceptions ?? []),
    ...buildBatchFacts(sources.batches ?? []),
    ...buildTraceabilityFacts(sources.traceability ?? []),
  ];
}

export function domainForFactType(type: OperationalFact["type"]): IntelligenceDomain {
  switch (type) {
    case "PRODUCTION_RISK":
    case "CAPACITY_RISK":
    case "DELIVERY_RISK":
      return "production";
    case "MATERIAL_SHORTAGE":
    case "MATERIAL_AT_RISK":
      return "materials";
    case "PROCUREMENT_RISK":
      return "procurement";
    case "SUPPLIER_RISK":
      return "suppliers";
    case "QUALITY_EXCEPTION":
    case "QUALITY_IMPACT":
      return "quality";
    case "TRACEABILITY_IMPACT":
    case "CUSTOMER_IMPACT":
      return "traceability";
    case "BATCH_HOLD":
      return "batches";
    case "REVENUE_RISK":
      return "commercial";
  }
}

export function confidenceLabel(confidence: IntelligenceConfidence): string {
  if (confidence === "KNOWN") return "Known";
  if (confidence === "PARTIAL") return "Partial";
  return "Insufficient data";
}
