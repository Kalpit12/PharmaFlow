export type MaterialBalanceInput = {
  id: string;
  title: string;
  requirement: number;
  available: number;
  incoming: number;
  projected: number | null;
  netRequirement: number | null;
  href?: string;
};

export type MaterialBalanceRow = {
  id: string;
  label: string;
  primary: number;
  secondary: number | null;
  href?: string;
};

/**
 * Top materials by gross requirement — primary = gross requirement, secondary = available.
 */
export function buildMaterialBalanceRows(rows: MaterialBalanceInput[], limit = 6): MaterialBalanceRow[] {
  return [...rows]
    .filter((row) => row.requirement > 0)
    .sort((a, b) => b.requirement - a.requirement)
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      label: row.title,
      primary: row.requirement,
      secondary: row.available,
      href: row.href ?? `/materials?q=${encodeURIComponent(row.title)}`,
    }));
}
