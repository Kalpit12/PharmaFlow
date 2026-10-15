import type { ChartBarRow } from "@/lib/charts/types";

export type ScheduledOperationSlice = {
  workstationId: string | null;
  plannedStart: string;
  plannedEnd: string;
  changeoverMinutes: number;
};

export type WorkstationCapacity = {
  id: string;
  code: string;
  name: string;
  capacityHoursPerDay: number;
  utilization: number;
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
const MS_PER_DAY = 86_400_000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function overlapHours(startMs: number, endMs: number, dayStartMs: number, dayEndMs: number): number {
  const from = Math.max(startMs, dayStartMs);
  const to = Math.min(endMs, dayEndMs);
  if (to <= from) return 0;
  return (to - from) / MS_PER_HOUR;
}

/** Scheduled load vs total workstation capacity for each UTC day. */
export function buildDailyCapacityLoad(input: {
  operations: ScheduledOperationSlice[];
  workstations: WorkstationCapacity[];
  horizonDays: number;
  anchor: Date;
}): ChartBarRow[] {
  const active = input.workstations.filter((row) => row.capacityHoursPerDay > 0);
  const dailyCapacityHours = active.reduce((sum, row) => sum + row.capacityHoursPerDay, 0);
  const day0 = startOfUtcDay(input.anchor);
  const rows: ChartBarRow[] = [];

  for (let d = 0; d < input.horizonDays; d += 1) {
    const dayStart = day0.getTime() + d * MS_PER_DAY;
    const dayEnd = dayStart + MS_PER_DAY;
    let loadHours = 0;
    for (const operation of input.operations) {
      if (!operation.workstationId) continue;
      const startMs = new Date(operation.plannedStart).getTime();
      const endMs = new Date(operation.plannedEnd).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
      loadHours += overlapHours(startMs, endMs, dayStart, dayEnd);
      if (operation.changeoverMinutes > 0) {
        loadHours += operation.changeoverMinutes / 60;
      }
    }
    const loadFactor = dailyCapacityHours > 0 ? Math.round((loadHours / dailyCapacityHours) * 100) : 0;
    const label = new Date(dayStart).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    rows.push({
      id: `day-${d}`,
      label,
      value: loadFactor,
      hint: `${Math.round(loadHours)}h load · ${Math.round(dailyCapacityHours)}h capacity`,
    });
  }
  return rows;
}

export function pickBottleneckWorkstation(workstations: WorkstationCapacity[]): WorkstationCapacity | null {
  if (workstations.length === 0) return null;
  return workstations.reduce((best, row) => (row.utilization > best.utilization ? row : best));
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
    .slice()
    .sort((a, b) => b.utilization - a.utilization)
    .map((row) => ({
      id: row.id,
      label: row.code,
      value: row.utilization,
      hint: row.name,
    }));
}
