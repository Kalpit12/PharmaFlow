/**
 * Offline tolerance for the shop-floor Timer: actions are queued in browser storage when the
 * network is down and replayed in order when it returns. The server de-duplicates replays via
 * `expectedOperationId` (409 = already applied) and back-dates events via `recordedAt`.
 */

export const OFFLINE_QUEUE_KEY = "pf.shopFloor.offlineQueue.v1";

export type QueuedShopFloorAction = {
  id: string;
  orderId: string;
  orderNumber: string;
  path: "start" | "pause" | "resume" | "stop" | "issue" | "qa-release";
  body: Record<string, unknown>;
  queuedAt: string;
};

export type QueueStorage = Pick<Storage, "getItem" | "setItem">;

export function readQueue(storage: QueueStorage | null): QueuedShopFloorAction[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(OFFLINE_QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as QueuedShopFloorAction[]) : [];
  } catch {
    return [];
  }
}

export function writeQueue(storage: QueueStorage | null, items: QueuedShopFloorAction[]): void {
  if (!storage) return;
  try {
    storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* storage full or blocked — the action stays only in memory */
  }
}

export function enqueue(
  storage: QueueStorage | null,
  item: Omit<QueuedShopFloorAction, "id" | "queuedAt">,
  now: Date = new Date()
): QueuedShopFloorAction[] {
  const entry: QueuedShopFloorAction = {
    ...item,
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: now.toISOString(),
    body: { ...item.body, recordedAt: item.body.recordedAt ?? now.toISOString() },
  };
  const next = [...readQueue(storage), entry];
  writeQueue(storage, next);
  return next;
}

export type FlushOutcome = "sent" | "duplicate" | "rejected" | "offline";

/** Classify a replay response. 409 means the server already has this action. */
export function classifyReplay(status: number | null): FlushOutcome {
  if (status === null) return "offline";
  if (status >= 200 && status < 300) return "sent";
  if (status === 409) return "duplicate";
  if (status === 401 || status >= 500) return "offline";
  return "rejected";
}

/** Replay queued actions in order. Stops at the first network failure so ordering is preserved. */
export async function flushQueue(
  storage: QueueStorage | null,
  send: (item: QueuedShopFloorAction) => Promise<number | null>
): Promise<{ sent: number; duplicates: number; rejected: QueuedShopFloorAction[]; remaining: number }> {
  const items = readQueue(storage);
  let sent = 0;
  let duplicates = 0;
  const rejected: QueuedShopFloorAction[] = [];
  let index = 0;
  for (; index < items.length; index += 1) {
    const outcome = classifyReplay(await send(items[index]!));
    if (outcome === "offline") break;
    if (outcome === "sent") sent += 1;
    else if (outcome === "duplicate") duplicates += 1;
    else rejected.push(items[index]!);
  }
  const remaining = items.slice(index);
  writeQueue(storage, remaining);
  return { sent, duplicates, rejected, remaining: remaining.length };
}
