import { requirePermission } from "@/lib/auth/authorization";
import { addPlantDays, plantWeekday, plantYmd, startOfPlantDay } from "@/lib/operations/plant-time";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";

export type RosterShiftChip = {
  id: string;
  workstationId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  timeLabel: string;
  shiftLabel: string | null;
  employeeId: string | null;
  employeeName: string | null;
  employeeOnLeave: boolean;
};

export type RosterWorkstationRow = {
  id: string;
  code: string;
  name: string;
  groupName: string | null;
  maintenanceDates: string[];
};

export type WorkstationRosterSnapshot = {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  days: Array<{ date: string; weekday: number; label: string }>;
  workstations: RosterWorkstationRow[];
  assignments: RosterShiftChip[];
  employees: Array<{ id: string; code: string; name: string }>;
};

export function formatPlantClock(minute: number): string {
  const normalized = ((minute % 1_440) + 1_440) % 1_440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function shiftTimeLabel(startMinute: number, endMinute: number): string {
  if (endMinute > 1_440) {
    return `${formatPlantClock(startMinute)}–${formatPlantClock(endMinute - 1_440)}`;
  }
  return `${formatPlantClock(startMinute)}–${formatPlantClock(endMinute)}`;
}

export function mondayOfPlantWeek(anchor: Date): Date {
  const day = startOfPlantDay(anchor);
  const weekday = plantWeekday(day);
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addPlantDays(day, offset);
}

function dateOnlyUtc(instant: Date): Date {
  const ymd = plantYmd(instant);
  const [y, m, d] = ymd.split("-").map((part) => Number(part));
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function dayHeader(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

export async function getWorkstationRosterSnapshot(
  ctx: TenantContext,
  weekStartIso?: string
): Promise<WorkstationRosterSnapshot> {
  requirePermission(ctx, "production.read");
  const prisma = getPrisma();
  const weekStart = weekStartIso ? startOfPlantDay(new Date(weekStartIso)) : mondayOfPlantWeek(new Date());
  if (Number.isNaN(weekStart.getTime())) {
    throw new ServerError("Invalid week start.", "INTERNAL");
  }
  const weekEnd = addPlantDays(weekStart, 6);

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addPlantDays(weekStart, index);
    return {
      date: plantYmd(date),
      weekday: plantWeekday(date),
      label: dayHeader(date),
    };
  });

  const [workstations, assignments, employees, exceptions, leaves] = await Promise.all([
    prisma.workstation.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      include: { group: { select: { name: true } } },
      orderBy: [{ group: { code: "asc" } }, { name: "asc" }],
    }),
    prisma.workstationRosterAssignment.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: dateOnlyUtc(weekStart), lte: dateOnlyUtc(weekEnd) },
      },
      include: { employee: { select: { id: true, name: true, code: true } } },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    }),
    prisma.plantEmployee.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.workstationCalendarException.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: dateOnlyUtc(weekStart), lte: dateOnlyUtc(weekEnd) },
      },
      select: { workstationId: true, date: true, reason: true },
    }),
    prisma.plantEmployeeLeave.findMany({
      where: {
        tenantId: ctx.tenantId,
        startDate: { lte: dateOnlyUtc(weekEnd) },
        endDate: { gte: dateOnlyUtc(weekStart) },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
  ]);

  const maintenanceByWs = new Map<string, string[]>();
  for (const row of exceptions) {
    const ymd = plantYmd(row.date);
    const list = maintenanceByWs.get(row.workstationId) ?? [];
    list.push(ymd);
    maintenanceByWs.set(row.workstationId, list);
  }

  const leaveSet = new Set<string>();
  for (const leave of leaves) {
    let day = startOfPlantDay(leave.startDate);
    const end = startOfPlantDay(leave.endDate);
    while (day.getTime() <= end.getTime()) {
      leaveSet.add(`${leave.employeeId}|${plantYmd(day)}`);
      day = addPlantDays(day, 1);
    }
  }

  return {
    weekStart: plantYmd(weekStart),
    weekEnd: plantYmd(weekEnd),
    weekLabel: `${dayHeader(weekStart)} – ${dayHeader(weekEnd)}`,
    days,
    workstations: workstations.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      groupName: row.group?.name ?? null,
      maintenanceDates: maintenanceByWs.get(row.id) ?? [],
    })),
    assignments: assignments.map((row) => {
      const dateKey = plantYmd(row.date);
      return {
        id: row.id,
        workstationId: row.workstationId,
        date: dateKey,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        timeLabel: shiftTimeLabel(row.startMinute, row.endMinute),
        shiftLabel: row.shiftLabel,
        employeeId: row.employeeId,
        employeeName: row.employee?.name ?? null,
        employeeOnLeave: row.employeeId ? leaveSet.has(`${row.employeeId}|${dateKey}`) : false,
      };
    }),
    employees,
  };
}

export async function duplicateRosterAssignment(
  ctx: TenantContext,
  assignmentId: string,
  targetDateIso: string
): Promise<{ id: string }> {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const source = await prisma.workstationRosterAssignment.findFirst({
    where: { id: assignmentId, tenantId: ctx.tenantId },
  });
  if (!source) throw new ServerError("Assignment not found.", "NOT_FOUND");
  const target = dateOnlyUtc(startOfPlantDay(new Date(targetDateIso)));
  const created = await prisma.workstationRosterAssignment.upsert({
    where: {
      workstationId_date_startMinute: {
        workstationId: source.workstationId,
        date: target,
        startMinute: source.startMinute,
      },
    },
    create: {
      tenantId: ctx.tenantId,
      workstationId: source.workstationId,
      date: target,
      startMinute: source.startMinute,
      endMinute: source.endMinute,
      employeeId: source.employeeId,
      shiftLabel: source.shiftLabel,
    },
    update: {
      endMinute: source.endMinute,
      employeeId: source.employeeId,
      shiftLabel: source.shiftLabel,
    },
  });
  return { id: created.id };
}
