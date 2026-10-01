export type InventoryHealthSegment = {
  id: string;
  label: string;
  value: number;
  tone: "intel" | "material" | "danger" | "primary" | "warning";
  href?: string;
};

type HealthBucket = { id: string; quantity: number };

/**
 * Compact inventory-health segments from existing inventory snapshot buckets.
 * Categories without source data are omitted (not shown as zero).
 */
export function buildInventoryHealthSegments(input: {
  health: HealthBucket[];
  expiringSoonQty?: number | null;
}): InventoryHealthSegment[] {
  const qty = (id: string) => input.health.find((row) => row.id === id)?.quantity ?? 0;
  const healthy = qty("HEALTHY");
  const low = qty("LOW");
  const critical = qty("CRITICAL");
  const out = qty("OUT_OF_STOCK");
  const expiring = input.expiringSoonQty ?? null;

  const segments: InventoryHealthSegment[] = [];
  if (healthy > 0) {
    segments.push({
      id: "HEALTHY",
      label: "Healthy",
      value: healthy,
      tone: "intel",
      href: "/inventory?view=health&status=HEALTHY",
    });
  }
  if (low > 0) {
    segments.push({
      id: "LOW",
      label: "At risk (low)",
      value: low,
      tone: "material",
      href: "/inventory?view=health&status=LOW",
    });
  }
  if (expiring != null && expiring > 0) {
    segments.push({
      id: "EXPIRING",
      label: "Expiring soon",
      value: expiring,
      tone: "material",
      href: "/inventory/expiry",
    });
  }
  const shortage = critical + out;
  if (shortage > 0) {
    segments.push({
      id: "CRITICAL",
      label: "Shortage / critical",
      value: shortage,
      tone: "danger",
      href: "/inventory?view=health&status=CRITICAL",
    });
  }
  return segments;
}
