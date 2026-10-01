/**
 * Deterministic analytics helpers.
 * Source: tenant-scoped Prisma / existing server services only.
 * Never invent forecasts, never treat unknown as zero for percentages.
 */

export { buildProductionPlannedVsActual, type ProductionComparisonRow, type ProductionOrderFact } from "./production";
export { buildInventoryHealthSegments, type InventoryHealthSegment } from "./inventory";
export { buildProcurementPipelineStages, type ProcurementPipelineStage, type ProcurementPipelineInput } from "./procurement";
export { buildMaterialBalanceRows, type MaterialBalanceRow, type MaterialBalanceInput } from "./materials";
export { toRevenueBarRows, type RevenueBarRow } from "./sales";
