import type {
  ImpactScope,
  TraceabilityConfidence,
  TraceabilityCoverage,
  TraceabilityCoverageRow,
  TraceabilityImpactRow,
  TraceabilityImpactSummary,
  TraceabilityPathNode,
} from "@/lib/traceability/types";

const BATCH_ORDER_NOTE =
  "Batch-to-order allocation not recorded. Sales orders shown only by matching finished product — not confirmed batch genealogy.";

export function assessTraceabilityConfidence(coverage: TraceabilityCoverageRow[]): TraceabilityConfidence {
  if (coverage.length === 0) return "INSUFFICIENT_DATA";
  const traceable = coverage.filter((row) => row.coverage === "TRACEABLE").length;
  const partial = coverage.filter((row) => row.coverage === "PARTIAL").length;
  const notRecorded = coverage.filter((row) => row.coverage === "NOT_RECORDED").length;
  if (notRecorded === coverage.length) return "INSUFFICIENT_DATA";
  if (traceable === coverage.length) return "COMPLETE";
  if (partial > 0 || (traceable > 0 && notRecorded > 0)) return "PARTIAL";
  return "INSUFFICIENT_DATA";
}

export function computeImpactScope(input: {
  batchCount: number;
  orderCount: number;
  customerCount: number;
  hasKnownLinks: boolean;
}): ImpactScope {
  if (!input.hasKnownLinks) return "UNKNOWN";
  const downstream = input.batchCount + input.orderCount + input.customerCount;
  if (downstream === 0) return "NO_KNOWN_IMPACT";
  if (input.batchCount <= 1 && input.customerCount <= 1 && input.orderCount <= 1) return "LIMITED_IMPACT";
  if (input.batchCount >= 2 || input.customerCount >= 2 || input.orderCount >= 2) return "SIGNIFICANT_IMPACT";
  return "LIMITED_IMPACT";
}

export function buildImpactSummary(input: {
  anchorLabel: string;
  path: TraceabilityPathNode[];
  coverage: TraceabilityCoverageRow[];
  batchCount: number;
  lotCount: number;
  orderCount: number;
  customerCount: number;
  quantityLabel: string;
  rows: TraceabilityImpactRow[];
  hasKnownLinks: boolean;
}): TraceabilityImpactSummary {
  const confidence = assessTraceabilityConfidence(input.coverage);
  const scope = computeImpactScope({
    batchCount: input.batchCount,
    orderCount: input.orderCount,
    customerCount: input.customerCount,
    hasKnownLinks: input.hasKnownLinks,
  });

  return {
    title: `Potential impact from ${input.anchorLabel}`,
    scope,
    confidence,
    affectedMaterialLots: input.lotCount,
    affectedProductionBatches: input.batchCount,
    affectedFinishedBatches: input.batchCount,
    affectedSalesOrders: input.orderCount,
    affectedCustomers: input.customerCount,
    affectedQuantityLabel: input.quantityLabel,
    allocationNote: BATCH_ORDER_NOTE,
    rows: input.rows,
  };
}

export function coverageLabel(coverage: TraceabilityCoverage): string {
  if (coverage === "TRACEABLE") return "Traceable";
  if (coverage === "PARTIAL") return "Partial";
  return "Not recorded";
}

export function scopeLabel(scope: ImpactScope): string {
  if (scope === "NO_KNOWN_IMPACT") return "No known impact";
  if (scope === "LIMITED_IMPACT") return "Limited impact";
  if (scope === "SIGNIFICANT_IMPACT") return "Significant impact";
  return "Unknown";
}

export function confidenceLabel(confidence: TraceabilityConfidence): string {
  if (confidence === "COMPLETE") return "Complete";
  if (confidence === "PARTIAL") return "Partial";
  return "Insufficient data";
}
