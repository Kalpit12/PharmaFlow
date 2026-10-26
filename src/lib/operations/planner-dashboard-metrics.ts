import type { ChartBarRow } from "@/lib/charts/types";
import {
  availableMinutesForDay,
  type WorkCalendar,
} from "@/lib/operations/calendar";
import { isElapsedOnlyWorkstation } from "@/lib/operations/elapsed-workstation";
import { addPlantDays, plantWeekday, startOfPlantDay } from "@/lib/operations/plant-time";
import { PLANT_CAPACITY_HOURS_PER_DAY } from "@/lib/operations/plant-shift-template";

export type ScheduledOperationSlice = {
  workstationId: string | null;
  workstationCode?: string | null;
  plannedStart: string;
  plannedEnd: string;
  changeoverMinutes: number;
  isElapsed?: boolean;
};

export type WorkstationCapacity = {
  id: string;
  code: string;
  name: string;
  capacityHoursPerDay: number;
  utilization: number;
  calendar?: WorkCalendar;
};

export type OtifInput = {
  dueDate: Date;
  actualCompletion: Date | null;
  status: string;
};

export type OtifSummary = {
  otifPercent: number | null;
  onTimeCount: number;
  lateCount: number;
  sampleSize: number;
};

export type OeeInput = {
  plannedMinutes: number;
  actualMinutes: number;
  downtimeEvents: number;
  scrapQuantity: number;
  goodQuantity: number;
};

export type OeeSummary = {
  availabilityPercent: number;
  performancePercent: number;
  qualityPercent: number;
  oeePercent: number;
};

const MS_PER_HOUR = 3_600_000;

function overlapHours(startMs: number, endMs: number, dayStartMs: number, dayEndMs: number): number {
  const from = Math.max(startMs, dayStartMs);
  const to = Math.min(endMs, dayEndMs);
  if (to <= from) return 0;
  return (to - from) / MS_PER_HOUR;
}

function productionCapacityHours(ws: WorkstationCapacity, day: Date): number {
  if (isElapsedOnlyWorkstation(ws.code)) return 0;
  if (ws.calendar) return availableMinutesForDay(day, ws.calendar) / 60;
  const weekday = plantWeekday(day);
  if (weekday === 0) return 0;
  if (weekday === 6) return 9.5;
  return ws.capacityHoursPerDay > 0 ? ws.capacityHoursPerDay : PLANT_CAPACITY_HOURS_PER_DAY;
}

export type DailyCapacityLoad = {
  production: ChartBarRow[];
  qcQueue: ChartBarRow[];
};

/** Scheduled machine load vs shift capacity for each plant day in [from, to). */
export function buildDailyCapacityLoad(input: {
  operations: ScheduledOperationSlice[];
  workstations: WorkstationCapacity[];
  horizonDays?: number;
  anchor?: Date;
  from?: Date;
  to?: Date;
}): DailyCapacityLoad {
  const from = input.from ?? input.anchor ?? new Date();
  const to =
    input.to ??
    (input.horizonDays != null ? addPlantDays(startOfPlantDay(from), input.horizonDays) : addPlantDays(startOfPlantDay(from), 7));
  const day0 = startOfPlantDay(from);
  const dayCount = Math.max(1, Math.round((startOfPlantDay(to).getTime() - day0.getTime()) / 86_400_000) || 1);
  const productionWs = input.workstations.filter((row) => !isElapsedOnlyWorkstation(row.code));
  const production: ChartBarRow[] = [];
  const qcQueue: ChartBarRow[] = [];

  for (let d = 0; d < dayCount; d += 1) {
    const dayStart = addPlantDays(day0, d);
    const dayEnd = addPlantDays(dayStart, 1);
    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayEnd.getTime();
    const label = dayStart.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });

    let machineHours = 0;
    let qcHours = 0;
    for (const operation of input.operations) {
      if (!operation.workstationId) continue;
      const startMs = new Date(operation.plannedStart).getTime();
      const endMs = new Date(operation.plannedEnd).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
      const hours = overlapHours(startMs, endMs, dayStartMs, dayEndMs);
      const elapsed = operation.isElapsed || isElapsedOnlyWorkstation(operation.workstationCode);
      if (elapsed) {
        qcHours += hours;
        continue;
      }
      machineHours += hours;
      if (operation.changeoverMinutes > 0 && startMs >= dayStartMs && startMs < dayEndMs) {
        machineHours += operation.changeoverMinutes / 60;
      }
    }

    const capacityHours = productionWs.reduce((sum, ws) => sum + productionCapacityHours(ws, dayStart), 0);
    const loadFactor =
      capacityHours > 0 ? Math.min(100, Math.round((machineHours / capacityHours) * 100)) : 0;

    production.push({
      id: `day-${d}`,
      label,
      value: loadFactor,
      hint: `${Math.round(machineHours)}h load · ${Math.round(capacityHours)}h capacity`,
    });
    qcQueue.push({
      id: `qc-${d}`,
      label,
      value: Math.round(qcHours * 10) / 10,
      hint: `${Math.round(qcHours)}h elapsed QC / quarantine (not machine load)`,
      tone: "material",
    });
  }

  return { production, qcQueue };
}

export function pickBottleneckWorkstation(workstations: WorkstationCapacity[]): WorkstationCapacity | null {
  const production = workstations.filter((row) => !isElapsedOnlyWorkstation(row.code));
  const pool = production.length > 0 ? production : workstations;
  if (pool.length === 0) return null;
  return pool.reduce((best, row) => (row.utilization > best.utilization ? row : best));
}

/** On-time-in-full: completed orders finished on or before customer due date. */
export function computeOtif(rows: OtifInput[]): OtifSummary {
  const completed = rows.filter((row) => row.status === "COMPLETED" && row.actualCompletion);
  if (completed.length === 0) {
    return { otifPercent: null, onTimeCount: 0, lateCount: 0, sampleSize: 0 };
  }
  const onTime = completed.filter((row) => row.actualCompletion!.getTime() <= row.dueDate.getTime());
  const lateCount = completed.length - onTime.length;
  return {
    otifPercent: Math.round((onTime.length / completed.length) * 100),
    onTimeCount: onTime.length,
    lateCount,
    sampleSize: completed.length,
  };
}

/** Shop-floor OEE proxy from timer events and quantities (deterministic, no ML). */
export function computeOeeProxy(input: OeeInput): OeeSummary {
  const planned = Math.max(input.plannedMinutes, 1);
  const actual = Math.max(input.actualMinutes, 1);
  const downtimePenalty = Math.min(0.4, input.downtimeEvents * 0.08);
  const availability = Math.round(Math.max(0, 1 - downtimePenalty) * 100);
  const performance = Math.round(Math.min(150, (planned / actual) * 100));
  const totalOut = input.goodQuantity + input.scrapQuantity;
  const quality =
    totalOut > 0 ? Math.round((input.goodQuantity / totalOut) * 100) : 100;
  const oeePercent = Math.round((availability / 100) * (performance / 100) * (quality / 100) * 100);
  return {
    availabilityPercent: availability,
    performancePercent: performance,
    qualityPercent: quality,
    oeePercent,
  };
}

export function workstationUtilizationRows(workstations: WorkstationCapacity[]): ChartBarRow[] {
  return workstations
    .filter((row) => !isElapsedOnlyWorkstation(row.code))
    .slice()
    .sort((a, b) => b.utilization - a.utilization)
    .map((row) => ({
      id: row.id,
      label: row.code,
      value: Math.min(100, row.utilization),
      hint: row.name,
    }));
}
