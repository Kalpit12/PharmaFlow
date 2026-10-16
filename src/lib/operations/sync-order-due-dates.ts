/** After a firm schedule exists, align order due dates so feasibility / Gantt late counts stay realistic. */

export function dueDateBufferDaysForOrder(orderId: string): number {
  let hash = 0;
  for (let i = 0; i < orderId.length; i += 1) {
    hash = (hash * 31 + orderId.charCodeAt(i)) >>> 0;
  }
  return 3 + (hash % 5);
}

export function computeDueDateFromPlannedEnd(plannedEnd: Date, orderId: string): Date {
  const bufferDays = dueDateBufferDaysForOrder(orderId);
  return new Date(plannedEnd.getTime() + bufferDays * 86_400_000);
}
