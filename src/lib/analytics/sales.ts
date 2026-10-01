export type RevenueBarRow = {
  id: string;
  label: string;
  value: number;
  hint?: string;
  href?: string;
  tone?: "primary" | "intel" | "material" | "danger" | "warning" | "neutral" | "default";
};

/** Map realized revenue aggregates into horizontal-bar rows (value already chart-scaled). */
export function toRevenueBarRows(
  rows: Array<{ id: string; label: string; value: number; hint?: string; href?: string }>,
  limit = 8
): RevenueBarRow[] {
  return [...rows]
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      label: row.label,
      value: row.value,
      hint: row.hint,
      href: row.href,
      tone: "primary" as const,
    }));
}
