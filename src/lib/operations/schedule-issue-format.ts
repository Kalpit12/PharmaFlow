import { PLANT_TIME_ZONE } from "@/lib/operations/plant-time";

export function formatPlantDateTime(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PLANT_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  return `${day} ${month} ${hour}:${minute}`;
}

export function formatSlippedStartDetail(plannedStart: Date, now: Date): string {
  return `Not started: planned ${formatPlantDateTime(plannedStart)}, now ${formatPlantDateTime(now)}.`;
}

export function formatLateDurationHuman(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return rem > 0 ? `${hours} h ${rem} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  if (h === 0) return `${days} d`;
  return `${days} d ${h} h`;
}

export function formatPastDueDetail(lateMinutes: number, dueDate: Date): string {
  return `Schedule finishes ${formatLateDurationHuman(lateMinutes)} after due (${formatPlantDateTime(dueDate)}).`;
}

export function formatRoutingIssueDetail(kind: string, raw: string, now = new Date()): string {
  if (kind === "SLIPPED_START") {
    const isoMatch = /Planned start ([\d-T:.Z]+)/i.exec(raw);
    if (isoMatch?.[1]) {
      const planned = new Date(isoMatch[1]);
      if (!Number.isNaN(planned.getTime())) return formatSlippedStartDetail(planned, now);
    }
  }
  if (kind === "PAST_DUE") {
    const dueMatch = /due date \(([\d-T:.Z]+)\)/i.exec(raw);
    const minMatch = /(\d+) minutes after due/i.exec(raw);
    if (dueMatch?.[1] && minMatch?.[1]) {
      return formatPastDueDetail(Number(minMatch[1]), new Date(dueMatch[1]));
    }
  }
  if (raw.includes("T") && raw.includes("Z")) {
    return raw.replace(/[\d]{4}-[\d]{2}-[\d]{2}T[\d:.]+Z/g, (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : formatPlantDateTime(d);
    });
  }
  return raw;
}

/** Shared delivery-late order count for Gantt Late tab and Execution KPIs. */
export function countDeliveryLateOrders(
  orders: Array<{
    id: string;
    orderKind: "FIRM" | "PROSPECT";
    dueDate: string | Date;
    routing: {
      operations: Array<{
        id: string;
        status: string;
        plannedStart: string | Date | null;
        plannedEnd: string | Date | null;
        isQcHold?: boolean;
      }>;
    };
  }>,
  orderPlannedEnd: Map<string, string | null>,
  activeTimerOperationIds: Set<string>,
  now: Date
): number {
  let count = 0;
  for (const order of orders) {
    if (order.orderKind !== "FIRM") continue;
    const ends = order.routing.operations
      .map((op) => op.plannedEnd)
      .filter(Boolean)
      .map((v) => new Date(v as string | Date).getTime());
    const orderEndMs =
      orderPlannedEnd.get(order.id) != null
        ? new Date(orderPlannedEnd.get(order.id)!).getTime()
        : ends.length
          ? Math.max(...ends)
          : null;
    if (orderEndMs == null) continue;
    const dueMs = new Date(order.dueDate).getTime();
    if (orderEndMs > dueMs) count += 1;
  }
  return count;
}
