export type ProductionOrderFact = {
  productId: string;
  productName: string;
  status: string;
  /** Planned / ordered quantity — never used as actual output. */
  quantity: number;
  /** Recorded produced quantity from ProductionBatch. Null = unknown (do not invent). */
  producedQuantity?: number | null;
};

export type ProductionComparisonRow = {
  id: string;
  label: string;
  primary: number;
  /** Null when no completed order has a recorded produced quantity. */
  secondary: number | null;
  href?: string;
};

/**
 * Planned = open pipeline quantity (non-COMPLETED).
 * Actual = sum of producedQuantity on COMPLETED orders only.
 * Never substitutes planned quantity for actual.
 */
export function buildProductionPlannedVsActual(rows: ProductionOrderFact[]): ProductionComparisonRow[] {
  const byProduct = new Map<string, { label: string; planned: number; actual: number; hasActual: boolean }>();

  for (const row of rows) {
    const entry = byProduct.get(row.productId) ?? {
      label: row.productName,
      planned: 0,
      actual: 0,
      hasActual: false,
    };
    if (row.status === "COMPLETED") {
      if (row.producedQuantity != null && Number.isFinite(row.producedQuantity)) {
        entry.actual += row.producedQuantity;
        entry.hasActual = true;
      }
    } else {
      entry.planned += row.quantity;
    }
    byProduct.set(row.productId, entry);
  }

  const result = [...byProduct.entries()]
    .map(([id, row]) => ({
      id,
      label: row.label,
      primary: row.planned,
      secondary: row.hasActual ? row.actual : null,
      href: "/execution/production",
    }))
    .filter((row) => row.primary > 0 || row.secondary != null)
    .sort((a, b) => b.primary + (b.secondary ?? 0) - (a.primary + (a.secondary ?? 0)))
    .slice(0, 6);

  if (result.length === 0 && rows.length > 0) {
    const planned = rows.filter((row) => row.status !== "COMPLETED").reduce((sum, row) => sum + row.quantity, 0);
    let actual = 0;
    let hasActual = false;
    for (const row of rows) {
      if (row.status === "COMPLETED" && row.producedQuantity != null && Number.isFinite(row.producedQuantity)) {
        actual += row.producedQuantity;
        hasActual = true;
      }
    }
    result.push({
      id: "all",
      label: "All production orders",
      primary: planned,
      secondary: hasActual ? actual : null,
      href: "/execution/production",
    });
  }

  return result;
}
