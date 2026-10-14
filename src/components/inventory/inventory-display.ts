import type { StatusTone } from "@/types/status";

export const healthTone: Record<string, StatusTone> = {
  OUT_OF_STOCK: "danger",
  CRITICAL: "danger",
  LOW: "material",
  HEALTHY: "intel",
  EXPIRED: "danger",
  EXPIRING_SOON: "material",
};

export function formatQty(value: number): string {
  return value.toLocaleString("en-KE");
}

export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const healthRank: Record<string, number> = {
  OUT_OF_STOCK: 4,
  CRITICAL: 3,
  LOW: 2,
  EXPIRED: 3,
  EXPIRING_SOON: 2,
  HEALTHY: 0,
};
