import {
  addWorkingMinutesOnCalendar,
  alignToCalendar,
  availableMinutesForDay,
  createStandardWorkCalendar,
  workingMinutesByDay,
  type WorkCalendar,
} from "@/lib/operations/calendar";

export const PRIORITY_RANK = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
} as const;

export type PlannerPriority = keyof typeof PRIORITY_RANK;

export type PlannerOrder = {
  id: string;
  orderNumber: string;
  productName: string;
  workstationId: string | null;
  durationMinutes: number;
  priority: PlannerPriority;
  dueDate: Date;
  createdAt: Date;
  isLocked: boolean;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  materialReadyAt?: Date | null;
  materialBlocked?: boolean;
};

export type PlannerWorkstation = {
  id: string;
  name: string;
  code: string;
  capacityHoursPerDay: number;
  calendar?: WorkCalendar;
};

export type ScheduledOrder = PlannerOrder & {
  plannedStart: Date | null;
  plannedEnd: Date | null;
  displayStatus: "UNSCHEDULED" | "SCHEDULED" | "AT_RISK";
};

export type ScheduleConflict = {
  severity: "INFO" | "WARNING" | "CRITICAL";
  kind:
    | "overlap"
    | "over-capacity"
    | "delivery-risk"
    | "unscheduled"
    | "missing-info"
    | "invalid-duration"
    | "inactive-workstation"
    | "material-unavailable";
  orderNumber: string;
  productName: string;
  workstationId?: string | null;
  title: string;
  detail: string;
  impact: string;
  nextAction: string;
};

const SHIFT_START_HOUR = 8;

export function comparePlannerOrders(a: PlannerOrder, b: PlannerOrder): number {
  const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (rank !== 0) return rank;
  const due = a.dueDate.getTime() - b.dueDate.getTime();
  if (due !== 0) return due;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function shiftStart(day: Date): Date {
  const start = startOfUtcDay(day);
  start.setUTCHours(SHIFT_START_HOUR, 0, 0, 0);
  return start;
}

export function shiftEnd(day: Date, hoursPerDay: number): Date {
  return new Date(shiftStart(day).getTime() + hoursPerDay * 60 * 60 * 1000);
}

export function alignToWork(from: Date, hoursPerDay: number): Date {
  return alignToCalendar(from, createStandardWorkCalendar(hoursPerDay));
}

export function addWorkingMinutes(from: Date, minutes: number, hoursPerDay: number): Date {
  return addWorkingMinutesOnCalendar(from, minutes, createStandardWorkCalendar(hoursPerDay));
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function buildSchedule(
  orders: PlannerOrder[],
  workstations: PlannerWorkstation[],
  window: { start: Date; end: Date },
  options?: { inactiveWorkstationIds?: Set<string> }
): { orders: ScheduledOrder[]; conflicts: ScheduleConflict[] } {
  const active = workstations.filter((row) => row.capacityHoursPerDay > 0);
  const hoursByWs = new Map(active.map((row) => [row.id, row.capacityHoursPerDay]));
  const calendarByWs = new Map(
    active.map((row) => [row.id, row.calendar ?? createStandardWorkCalendar(row.capacityHoursPerDay)])
  );
  const cursor = new Map<string, Date>();
  for (const ws of active) cursor.set(ws.id, alignToCalendar(window.start, calendarByWs.get(ws.id)!));

  const locked = orders.filter((row) => row.isLocked && row.plannedStart && row.plannedEnd);
  for (const row of locked) {
    if (!row.workstationId || !row.plannedEnd) continue;
    const current = cursor.get(row.workstationId) ?? window.start;
    if (row.plannedEnd.getTime() > current.getTime()) cursor.set(row.workstationId, row.plannedEnd);
  }

  const result: ScheduledOrder[] = orders.map((row) => {
    if (row.isLocked) {
      const atRisk = Boolean(row.plannedEnd && row.plannedEnd.getTime() > row.dueDate.getTime());
      return {
        ...row,
        displayStatus: !row.plannedStart ? "UNSCHEDULED" : atRisk ? "AT_RISK" : "SCHEDULED",
      };
    }
    if (row.plannedStart && row.plannedEnd) {
      const atRisk = row.plannedEnd.getTime() > row.dueDate.getTime();
      return { ...row, displayStatus: atRisk ? "AT_RISK" : "SCHEDULED" };
    }
    return { ...row, plannedStart: null, plannedEnd: null, displayStatus: "UNSCHEDULED" };
  });

  const unscheduled = result
    .filter((row) => row.displayStatus === "UNSCHEDULED" && !row.isLocked)
    .slice()
    .sort(comparePlannerOrders);

  for (const order of unscheduled) {
    if (order.materialBlocked) continue;
    const preferred = order.workstationId && hoursByWs.has(order.workstationId) ? order.workstationId : null;
    const workstationId =
      preferred ??
      [...cursor.entries()].sort((a, b) => a[1].getTime() - b[1].getTime())[0]?.[0] ??
      null;
    if (!workstationId) continue;
    const hours = hoursByWs.get(workstationId) ?? 8;
    const calendar = calendarByWs.get(workstationId) ?? createStandardWorkCalendar(hours);
    const resourceReady = cursor.get(workstationId) ?? window.start;
    const materialReady =
      order.materialReadyAt && order.materialReadyAt.getTime() > resourceReady.getTime()
        ? order.materialReadyAt
        : resourceReady;
    const start = alignToCalendar(materialReady, calendar);
    const end = addWorkingMinutesOnCalendar(start, order.durationMinutes, calendar);
    cursor.set(workstationId, end);
    const atRisk = end.getTime() > order.dueDate.getTime();
    const index = result.findIndex((row) => row.id === order.id);
    result[index] = {
      ...result[index],
      workstationId,
      plannedStart: start,
      plannedEnd: end,
      displayStatus: atRisk ? "AT_RISK" : "SCHEDULED",
    };
  }

  const conflicts = detectConflicts(result, active, window, options);
  return { orders: result, conflicts };
}

export function detectConflicts(
  orders: ScheduledOrder[],
  workstations: PlannerWorkstation[],
  window: { start: Date; end: Date },
  options?: { inactiveWorkstationIds?: Set<string> }
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const scheduled = orders.filter((row) => row.plannedStart && row.plannedEnd && row.workstationId);
  const inactive = options?.inactiveWorkstationIds ?? new Set<string>();

  for (let i = 0; i < scheduled.length; i += 1) {
    for (let j = i + 1; j < scheduled.length; j += 1) {
      const a = scheduled[i];
      const b = scheduled[j];
      if (a.workstationId !== b.workstationId) continue;
      if (overlaps(a.plannedStart!, a.plannedEnd!, b.plannedStart!, b.plannedEnd!)) {
        conflicts.push({
          severity: "WARNING",
          kind: "overlap",
          orderNumber: a.orderNumber,
          productName: a.productName,
          workstationId: a.workstationId,
          title: `Overlap on ${workstations.find((ws) => ws.id === a.workstationId)?.name ?? "line"}`,
          detail: `${a.orderNumber} overlaps ${b.orderNumber}.`,
          impact: "Two jobs share the same workstation time.",
          nextAction: "Resequence or adjust planned times.",
        });
      }
    }
  }

  const calendarByWs = new Map(
    workstations.map((row) => [row.id, row.calendar ?? createStandardWorkCalendar(row.capacityHoursPerDay)])
  );
  const byDay = new Map<string, number>();
  const capacityKeys = new Set<string>();
  for (const order of scheduled) {
    const calendar = calendarByWs.get(order.workstationId!) ?? createStandardWorkCalendar(8);
    for (const [day, minutes] of workingMinutesByDay(order.plannedStart!, order.plannedEnd!, calendar)) {
      const key = `${order.workstationId}:${day}`;
      byDay.set(key, (byDay.get(key) ?? 0) + minutes);
    }
  }
  for (const [key, minutes] of byDay) {
    const workstationId = key.split(":")[0];
    const day = key.slice(workstationId.length + 1);
    const calendar = calendarByWs.get(workstationId) ?? createStandardWorkCalendar(8);
    const availableMinutes = availableMinutesForDay(new Date(`${day}T00:00:00.000Z`), calendar);
    if (minutes > availableMinutes + 0.5 && !capacityKeys.has(workstationId)) {
      capacityKeys.add(workstationId);
      const ws = workstations.find((row) => row.id === workstationId);
      conflicts.push({
        severity: "CRITICAL",
        kind: "over-capacity",
        orderNumber: "",
        productName: ws?.name ?? "Workstation",
        workstationId,
        title: `${ws?.name ?? "Line"} exceeds daily capacity`,
        detail: `${Math.round(minutes / 60)}h scheduled against ${Math.round(availableMinutes / 60)}h available.`,
        impact: "Utilization above finite capacity for a day.",
        nextAction: "Reduce load or extend the horizon.",
      });
    }
  }

  for (const order of orders) {
    if (order.materialBlocked) {
      conflicts.push({
        severity: "CRITICAL",
        kind: "material-unavailable",
        orderNumber: order.orderNumber,
        productName: order.productName,
        workstationId: order.workstationId,
        title: `${order.orderNumber} is blocked by material availability`,
        detail: "Dated on-hand and incoming supply cannot cover this order.",
        impact: "A new schedule cannot assign production until material supply is confirmed.",
        nextAction: "Resolve the shortage or record a dated incoming receipt.",
      });
    } else if (
      order.materialReadyAt &&
      order.plannedStart &&
      order.plannedStart.getTime() < order.materialReadyAt.getTime()
    ) {
      conflicts.push({
        severity: "CRITICAL",
        kind: "material-unavailable",
        orderNumber: order.orderNumber,
        productName: order.productName,
        workstationId: order.workstationId,
        title: `${order.orderNumber} starts before materials are available`,
        detail: `Material-ready date is ${formatDay(order.materialReadyAt)}.`,
        impact: "The recorded start is not feasible against dated supply.",
        nextAction: "Move the order after material availability or expedite supply.",
      });
    }

    if (order.durationMinutes <= 0) {
      conflicts.push({
        severity: "WARNING",
        kind: "invalid-duration",
        orderNumber: order.orderNumber,
        productName: order.productName,
        workstationId: order.workstationId,
        title: `${order.orderNumber} has invalid duration`,
        detail: "Duration must be greater than zero.",
        impact: "Schedule cannot be calculated reliably.",
        nextAction: "Correct duration before releasing.",
      });
    }

    if (order.workstationId && inactive.has(order.workstationId)) {
      conflicts.push({
        severity: "CRITICAL",
        kind: "inactive-workstation",
        orderNumber: order.orderNumber,
        productName: order.productName,
        workstationId: order.workstationId,
        title: `${order.orderNumber} assigned to inactive workstation`,
        detail: "The workstation is not active for planning.",
        impact: "Production cannot run on this line.",
        nextAction: "Assign an active workstation.",
      });
    }

    if (order.plannedStart && !order.workstationId) {
      conflicts.push({
        severity: "WARNING",
        kind: "missing-info",
        orderNumber: order.orderNumber,
        productName: order.productName,
        workstationId: null,
        title: `${order.orderNumber} is missing workstation`,
        detail: "A start time exists but no workstation is assigned.",
        impact: "Capacity and sequence cannot be validated.",
        nextAction: "Assign a workstation.",
      });
    }

    if (!order.plannedStart && order.workstationId && !order.isLocked) {
      conflicts.push({
        severity: "INFO",
        kind: "missing-info",
        orderNumber: order.orderNumber,
        productName: order.productName,
        workstationId: order.workstationId,
        title: `${order.orderNumber} needs schedule review`,
        detail: "Workstation is set but no planned start/end exists.",
        impact: "The order is not fully planned.",
        nextAction: "Set planned start and end.",
      });
    }

    if (order.plannedEnd && order.plannedEnd.getTime() > order.dueDate.getTime()) {
      const delayDays = Math.ceil((order.plannedEnd.getTime() - order.dueDate.getTime()) / (24 * 60 * 60 * 1000));
      conflicts.push({
        severity: order.priority === "CRITICAL" ? "CRITICAL" : "WARNING",
        kind: "delivery-risk",
        orderNumber: order.orderNumber,
        productName: order.productName,
        workstationId: order.workstationId,
        title: `${order.productName} is at risk`,
        detail: `Due ${formatDay(order.dueDate)}. Planned completion ${formatDay(order.plannedEnd)}.`,
        impact: `${delayDays}-day delay`,
        nextAction: "Protect capacity or split the run.",
      });
    }
    if (!order.plannedStart) {
      conflicts.push({
        severity: "INFO",
        kind: "unscheduled",
        orderNumber: order.orderNumber,
        productName: order.productName,
        workstationId: order.workstationId,
        title: `${order.orderNumber} is unscheduled`,
        detail: "No start time is assigned.",
        impact: "The order is not on the Gantt.",
        nextAction: "Assign a workstation and schedule.",
      });
    }
  }

  void window;
  return conflicts;
}

export function utilizationPercent(scheduledMinutes: number, availableMinutes: number): number {
  if (availableMinutes <= 0) return 0;
  return Math.round((scheduledMinutes / availableMinutes) * 100);
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
