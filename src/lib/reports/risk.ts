export type ReportRisk = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "HEALTHY";
export type MaterialStatus = "CRITICAL" | "SHORT" | "BELOW_SAFETY" | "HEALTHY" | "EXCESS";

export type TimeBucket = {
  id: string;
  label: string;
  min: number | null;
  max: number | null;
};

export const EXPIRY_BUCKETS: TimeBucket[] = [
  { id: "expired", label: "Expired", min: null, max: -1 },
  { id: "0-30", label: "0–30 days", min: 0, max: 30 },
  { id: "31-60", label: "31–60 days", min: 31, max: 60 },
  { id: "61-90", label: "61–90 days", min: 61, max: 90 },
  { id: "91-120", label: "91–120 days", min: 91, max: 120 },
  { id: "121-150", label: "121–150 days", min: 121, max: 150 },
  { id: "151-180", label: "151–180 days", min: 151, max: 180 },
  { id: "181-210", label: "181–210 days", min: 181, max: 210 },
  { id: "211-240", label: "211–240 days", min: 211, max: 240 },
  { id: "241-270", label: "241–270 days", min: 241, max: 270 },
  { id: "271-300", label: "271–300 days", min: 271, max: 300 },
  { id: "301-330", label: "301–330 days", min: 301, max: 330 },
  { id: "331-360", label: "331–360 days", min: 331, max: 360 },
  { id: "360+", label: "360+ days", min: 361, max: null },
];

export const AGEING_BUCKETS: TimeBucket[] = [
  { id: "0-30", label: "0–30 days", min: 0, max: 30 },
  { id: "31-60", label: "31–60 days", min: 31, max: 60 },
  { id: "61-90", label: "61–90 days", min: 61, max: 90 },
  { id: "91-120", label: "91–120 days", min: 91, max: 120 },
  { id: "121-150", label: "121–150 days", min: 121, max: 150 },
  { id: "151-180", label: "151–180 days", min: 151, max: 180 },
  { id: "181-210", label: "181–210 days", min: 181, max: 210 },
  { id: "211-240", label: "211–240 days", min: 211, max: 240 },
  { id: "241-270", label: "241–270 days", min: 241, max: 270 },
  { id: "271-300", label: "271–300 days", min: 271, max: 300 },
  { id: "301-330", label: "301–330 days", min: 301, max: 330 },
  { id: "331-360", label: "331–360 days", min: 331, max: 360 },
  { id: "360+", label: "360+ days", min: 361, max: null },
];

const DAY_MS = 86_400_000;

export function wholeDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export function matchBucket(value: number, buckets: TimeBucket[]): TimeBucket {
  const found = buckets.find((bucket) => {
    const minOk = bucket.min === null || value >= bucket.min;
    const maxOk = bucket.max === null || value <= bucket.max;
    return minOk && maxOk;
  });
  return found ?? buckets[buckets.length - 1];
}

export function expiryRisk(daysRemaining: number): ReportRisk {
  if (daysRemaining < 0) return "CRITICAL";
  if (daysRemaining <= 30) return "HIGH";
  if (daysRemaining <= 90) return "MEDIUM";
  if (daysRemaining <= 180) return "LOW";
  return "HEALTHY";
}

export function ageingRisk(ageDays: number): ReportRisk {
  if (ageDays >= 360) return "CRITICAL";
  if (ageDays >= 181) return "HIGH";
  if (ageDays >= 91) return "MEDIUM";
  return "HEALTHY";
}

export function materialStatus(stock: number, safetyStock: number): MaterialStatus {
  if (safetyStock <= 0) return stock <= 0 ? "SHORT" : "HEALTHY";
  if (stock <= 0) return "CRITICAL";
  if (stock < safetyStock * 0.5) return "SHORT";
  if (stock < safetyStock) return "BELOW_SAFETY";
  if (stock > safetyStock * 3) return "EXCESS";
  return "HEALTHY";
}

export function materialRisk(status: MaterialStatus): ReportRisk {
  if (status === "CRITICAL" || status === "SHORT") return "CRITICAL";
  if (status === "BELOW_SAFETY") return "HIGH";
  if (status === "EXCESS") return "MEDIUM";
  return "HEALTHY";
}

export function productionRisk(status: string): ReportRisk {
  if (status === "AT_RISK") return "HIGH";
  if (status === "UNSCHEDULED") return "MEDIUM";
  return "HEALTHY";
}

export type InventoryHealth = "OUT_OF_STOCK" | "CRITICAL" | "LOW" | "HEALTHY";

export function inventoryHealth(onHand: number, safetyStock: number): InventoryHealth {
  if (onHand <= 0) return "OUT_OF_STOCK";
  if (safetyStock > 0 && onHand <= safetyStock * 0.5) return "CRITICAL";
  if (safetyStock > 0 && onHand <= safetyStock) return "LOW";
  return "HEALTHY";
}

export function inventoryHealthRisk(status: InventoryHealth): ReportRisk {
  if (status === "OUT_OF_STOCK" || status === "CRITICAL") return "CRITICAL";
  if (status === "LOW") return "HIGH";
  return "HEALTHY";
}

export const INVENTORY_EXPIRY_BUCKETS: TimeBucket[] = [
  { id: "expired", label: "Expired", min: null, max: -1 },
  { id: "0-30", label: "0–30 days", min: 0, max: 30 },
  { id: "31-60", label: "31–60 days", min: 31, max: 60 },
  { id: "61-90", label: "61–90 days", min: 61, max: 90 },
  { id: "91-120", label: "91–120 days", min: 91, max: 120 },
  { id: "121-180", label: "121–180 days", min: 121, max: 180 },
  { id: "180+", label: "180+ days", min: 181, max: null },
];

export type BatchExpiryStatus = "EXPIRED" | "EXPIRING_SOON" | "HEALTHY";

export function batchExpiryStatus(daysRemaining: number | null): BatchExpiryStatus | null {
  if (daysRemaining === null) return null;
  if (daysRemaining < 0) return "EXPIRED";
  if (daysRemaining <= 30) return "EXPIRING_SOON";
  return "HEALTHY";
}

export function sharePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}
