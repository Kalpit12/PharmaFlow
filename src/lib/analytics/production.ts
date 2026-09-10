export type ProductionComparisonRow = {
  id: string;
  label: string;
  primary: number;
  secondary: number | null;
  href?: string;
};

export function buildProductionPlannedVsActual(
  rows: Array<{ productId: string; productName: string; status: string; quantity: number }>
): ProductionComparisonRow[] {
  const byProduct = new Map<string, { label: string; planned: number; actual: number }>();

  for (const row of rows) {
    const entry = byProduct.get(row.productId) ?? { label: row.productName, planned: 0, actual: 0 };
    if (row.status === "COMPLETED") {
      entry.actual += row.quantity;
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
      secondary: row.actual > 0 ? row.actual : null,
      href: "/operations",
    }))
    .sort((a, b) => b.primary + (b.secondary ?? 0) - (a.primary + (a.secondary ?? 0)))
    .slice(0, 6);

  if (result.length === 0 && rows.length > 0) {
    const planned = rows.filter((row) => row.status !== "COMPLETED").reduce((sum, row) => sum + row.quantity, 0);
    const actual = rows.filter((row) => row.status === "COMPLETED").reduce((sum, row) => sum + row.quantity, 0);
    result.push({
      id: "all",
      label: "All production orders",
      primary: planned,
      secondary: actual > 0 ? actual : null,
      href: "/operations",
    });
  }

  return result;
}
