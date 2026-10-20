import { requirePermission } from "@/lib/auth/authorization";
import {
  assignOperatorForSlot,
  registerRosterEmployees,
  resetRosterAssignmentLoads,
  resetRosterSlotLoads,
} from "@/lib/operations/lab-allied-roster-staffing";
import { validateRosterChips } from "@/lib/operations/roster-shift-validation";
import { rosterBandsForWorkstation } from "@/lib/operations/roster-shift-bands";
import {
  PLANT_DAY_SHIFT_END,
  PLANT_DAY_SHIFT_START,
  PLANT_NIGHT_SHIFT_END,
  PLANT_NIGHT_SHIFT_START,
} from "@/lib/operations/plant-shift-template";
import { addPlantDays, plantWeekday, plantYmd, startOfPlantDay } from "@/lib/operations/plant-time";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";
import { randomUUID } from "crypto";

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
  warnings: string[];
};

export type RosterWorkstationRow = {
  id: string;
  code: string;
  name: string;
  groupName: string | null;
  groupCode: string | null;
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
  warningCount: number;
};

export function formatPlantClock(minute: number): string {
  const normalized = ((minute % 1_440) + 1_440) % 1_440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function shiftTimeLabel(startMinute: number, endMinute: number): string {
  if (startMinute === 0 && endMinute >= 1_440) return "24h elapsed";
  if (endMinute > 1_440) {
    return `${formatPlantClock(startMinute)}–${formatPlantClock(endMinute - 1_440)} (+1)`;
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

  const [workstations, rosterRows, employees, exceptions, leaves, shiftRows] = await Promise.all([
    prisma.workstation.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      include: { group: { select: { name: true, code: true } } },
      orderBy: { name: "asc" },
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
    prisma.workstationShift.findMany({
      where: { tenantId: ctx.tenantId },
      select: { workstationId: true, weekday: true, startMinute: true, endMinute: true },
    }),
  ]);

  const shiftsByWs = new Map<string, Array<{ weekday: number; startMinute: number; endMinute: number }>>();
  for (const row of shiftRows) {
    const list = shiftsByWs.get(row.workstationId) ?? [];
    list.push(row);
    shiftsByWs.set(row.workstationId, list);
  }

  const assignmentByKey = new Map<string, (typeof rosterRows)[number]>();
  for (const row of rosterRows) {
    assignmentByKey.set(`${row.workstationId}|${plantYmd(row.date)}|${row.startMinute}`, row);
  }

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

  type DraftChip = RosterShiftChip & { employeeCode: string | null; groupCode: string | null };
  registerRosterEmployees(employees);
  resetRosterAssignmentLoads();
  const draftChips: DraftChip[] = [];
  for (const day of days) {
    resetRosterSlotLoads();
    const sortedWs = [...workstations].sort((a, b) => a.code.localeCompare(b.code));
    for (const ws of sortedWs) {
      const wsShifts = shiftsByWs.get(ws.id) ?? [];
      const bands = rosterBandsForWorkstation(wsShifts, day.weekday);
      for (const band of bands) {
        const key = `${ws.id}|${day.date}|${band.startMinute}`;
        const stored = assignmentByKey.get(key);
        let startMinute = stored?.startMinute ?? band.startMinute;
        let endMinute = stored?.endMinute ?? band.endMinute;
        if (band.shiftLabel === "Day") {
          startMinute = PLANT_DAY_SHIFT_START;
          endMinute = PLANT_DAY_SHIFT_END;
        } else if (band.shiftLabel === "Night") {
          startMinute = PLANT_NIGHT_SHIFT_START;
          endMinute = 1_440 + PLANT_NIGHT_SHIFT_END;
        }
        const dateKey = day.date;
        let employeeId = stored?.employeeId ?? null;
        let employeeName = stored?.employee?.name ?? null;
        let employeeCode = stored?.employee?.code ?? null;
        if (!employeeId) {
          const fallback = assignOperatorForSlot({
            dateYmd: dateKey,
            shiftLabel: band.shiftLabel,
            startMinute,
            endMinute,
            groupCode: ws.group?.code ?? null,
            workstationCode: ws.code,
          });
          employeeId = fallback?.id ?? null;
          employeeName = fallback?.name ?? null;
          employeeCode = fallback?.code ?? null;
        }
        draftChips.push({
          id: stored?.id ?? `tpl:${key}:${randomUUID()}`,
          workstationId: ws.id,
          date: dateKey,
          startMinute,
          endMinute,
          timeLabel: shiftTimeLabel(startMinute, endMinute),
          shiftLabel: stored?.shiftLabel ?? band.shiftLabel,
          employeeId,
          employeeName,
          employeeOnLeave: employeeId ? leaveSet.has(`${employeeId}|${dateKey}`) : false,
          warnings: [],
          employeeCode,
          groupCode: ws.group?.code ?? null,
        });
      }
    }
  }

  const warningMap = validateRosterChips(
    draftChips.map((chip) => ({
      id: chip.id,
      employeeId: chip.employeeId,
      employeeCode: chip.employeeCode ?? employees.find((e) => e.id === chip.employeeId)?.code,
      date: chip.date,
      startMinute: chip.startMinute,
      endMinute: chip.endMinute,
      groupCode: chip.groupCode,
      workstationId: chip.workstationId,
    }))
  );
  let warningCount = 0;
  const assignments: RosterShiftChip[] = draftChips.map((chip) => {
    const warnings = warningMap.get(chip.id) ?? [];
    if (warnings.length > 0) warningCount += 1;
    return {
      id: chip.id,
      workstationId: chip.workstationId,
      date: chip.date,
      startMinute: chip.startMinute,
      endMinute: chip.endMinute,
      timeLabel: chip.timeLabel,
      shiftLabel: chip.shiftLabel,
      employeeId: chip.employeeId,
      employeeName: chip.employeeName,
      employeeOnLeave: chip.employeeOnLeave,
      warnings,
    };
  });

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
      groupCode: row.group?.code ?? null,
      maintenanceDates: maintenanceByWs.get(row.id) ?? [],
    })),
    assignments,
    employees,
    warningCount,
  };
}

export async function upsertRosterAssignment(
  ctx: TenantContext,
  input: {
    id?: string;
    workstationId: string;
    date: string;
    startMinute: number;
    endMinute: number;
    employeeId?: string | null;
    shiftLabel?: string | null;
  }
): Promise<{ id: string }> {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const date = dateOnlyUtc(startOfPlantDay(new Date(input.date)));
  const created = await prisma.workstationRosterAssignment.upsert({
    where: {
      workstationId_date_startMinute: {
        workstationId: input.workstationId,
        date,
        startMinute: input.startMinute,
      },
    },
    create: {
      tenantId: ctx.tenantId,
      workstationId: input.workstationId,
      date,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      employeeId: input.employeeId ?? null,
      shiftLabel: input.shiftLabel ?? null,
    },
    update: {
      endMinute: input.endMinute,
      employeeId: input.employeeId ?? null,
      shiftLabel: input.shiftLabel ?? null,
    },
  });
  const { markWorkstationScheduleStale } = await import("@/lib/server/workstation-settings");
  await markWorkstationScheduleStale(ctx, `ROSTER_UPDATED ${input.workstationId}`);
  return { id: created.id };
}

export async function deleteRosterAssignment(ctx: TenantContext, assignmentId: string): Promise<void> {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const row = await prisma.workstationRosterAssignment.findFirst({
    where: { id: assignmentId, tenantId: ctx.tenantId },
  });
  if (!row) throw new ServerError("Assignment not found.", "NOT_FOUND");
  await prisma.workstationRosterAssignment.delete({ where: { id: row.id } });
  const { markWorkstationScheduleStale } = await import("@/lib/server/workstation-settings");
  await markWorkstationScheduleStale(ctx, `ROSTER_DELETED ${row.workstationId}`);
}

export async function duplicateRosterAssignment(
  ctx: TenantContext,
  assignmentId: string,
  targetDateIso: string
): Promise<{ id: string }> {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  if (assignmentId.startsWith("tpl:")) {
    throw new ServerError("Save the shift before duplicating.", "INTERNAL");
  }
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
  const { markWorkstationScheduleStale } = await import("@/lib/server/workstation-settings");
  await markWorkstationScheduleStale(ctx, `ROSTER_DUPLICATED ${source.workstationId}`);
  return { id: created.id };
}
