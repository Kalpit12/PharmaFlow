import { parsePauseReasonCode, type PauseReasonCode } from "@/lib/production-execution/pause-reasons";

/** Max age for an offline-queued shop-floor log. Older logs are refused rather than back-dated. */
export const OFFLINE_LOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type ShopFloorActionOptions = {
  reason?: string | null;
  reasonCode?: PauseReasonCode | null;
  /** Operation the operator saw when they tapped. A mismatch means the action was already applied (offline replay). */
  expectedOperationId?: string | null;
  /** When the operator tapped (offline queue). Clamped to [now − 24h, now]. */
  recordedAt?: Date | null;
};

export type ParsedShopFloorBody = ShopFloorActionOptions & {
  producedQuantity?: number;
  scrapQuantity?: number;
  signature?: string;
};

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Clamp a client timestamp. Future → now; older than the offline window → null (caller refuses). */
export function clampRecordedAt(value: unknown, now: Date = new Date()): Date | null | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  if (date.getTime() > now.getTime()) return now;
  if (now.getTime() - date.getTime() > OFFLINE_LOG_MAX_AGE_MS) return null;
  return date;
}

export function parseShopFloorBody(raw: unknown, now: Date = new Date()): ParsedShopFloorBody {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const recordedAt = clampRecordedAt(body.recordedAt, now);
  return {
    reason: typeof body.reason === "string" ? body.reason : undefined,
    reasonCode: parsePauseReasonCode(body.reasonCode),
    expectedOperationId: typeof body.expectedOperationId === "string" ? body.expectedOperationId : undefined,
    recordedAt,
    producedQuantity: finiteNumber(body.producedQuantity),
    scrapQuantity: finiteNumber(body.scrapQuantity),
    signature: typeof body.signature === "string" ? body.signature : undefined,
  };
}
