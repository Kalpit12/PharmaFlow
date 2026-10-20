import {
  addWorkingMinutesOnCalendar,
  alignToCalendar,
  createStandardWorkCalendar,
  type WorkCalendar,
} from "@/lib/operations/calendar";
import {
  canScheduleOnWorkstation,
  gmpCleanMinutesBeforeJob,
  type WorkstationGmpProfile,
} from "@/lib/operations/workstation-gmp";
import {
  DEFAULT_SEGREGATION_CLEAN_MINUTES,
  segregationTransitionRequiresClean,
  syntheticSegregationRuleId,
} from "@/lib/operations/changeover-segregation";
import type { ChangeoverConstraint, QualifiedResource, RoutingWorkstation } from "@/lib/operations/routing";

function resolveChangeover(
  constraints: ChangeoverConstraint[],
  workstationId: string,
  fromFamily: string | null,
  toFamily: string | null
): ChangeoverConstraint | null {
  if (!fromFamily || !toFamily || fromFamily === toFamily) return null;
  return (
    constraints.find(
      (rule) =>
        rule.workstationId === workstationId &&
        rule.fromFamily === fromFamily &&
        rule.toFamily === toFamily
    ) ??
    constraints.find(
      (rule) =>
        rule.workstationId === null &&
        rule.fromFamily === fromFamily &&
        rule.toFamily === toFamily
    ) ??
    (segregationTransitionRequiresClean(fromFamily, toFamily)
      ? {
          id: syntheticSegregationRuleId(fromFamily, toFamily),
          workstationId: null,
          fromFamily,
          toFamily,
          durationMinutes: DEFAULT_SEGREGATION_CLEAN_MINUTES,
        }
      : null)
  );
}

type ResourceState = { availableAt: Date; lastFamily: string | null; batchesSinceClean: number };

export type CandidateDebugRow = {
  workstationCode: string;
  workstationId: string;
  earliestFinish: string | null;
  rejectedReason: string | null;
  selected: boolean;
};

export function debugResourceCandidates(input: {
  workstationById: Map<string, RoutingWorkstation>;
  workstationCodeById: Map<string, string>;
  resources: QualifiedResource[];
  resourceState: Map<string, ResourceState>;
  changeovers: ChangeoverConstraint[];
  predecessorReady: Date;
  durationMinutes: number;
  setupMinutes: number;
  teardownMinutes: number;
  changeoverFamily: string | null;
  selectedWorkstationId: string | null;
}): CandidateDebugRow[] {
  const rows: CandidateDebugRow[] = [];
  for (const resource of input.resources) {
    const workstation = input.workstationById.get(resource.workstationId);
    const code = input.workstationCodeById.get(resource.workstationId) ?? resource.workstationId;
    if (!workstation) {
      rows.push({
        workstationCode: code,
        workstationId: resource.workstationId,
        earliestFinish: null,
        rejectedReason: "Workstation not active in scheduler input",
        selected: resource.workstationId === input.selectedWorkstationId,
      });
      continue;
    }
    const calendar = workstation.calendar ?? createStandardWorkCalendar(workstation.capacityHoursPerDay);
    const state = input.resourceState.get(resource.workstationId) ?? {
      availableAt: input.predecessorReady,
      lastFamily: null,
      batchesSinceClean: 0,
    };
    const rule = resolveChangeover(
      input.changeovers,
      resource.workstationId,
      state.lastFamily,
      input.changeoverFamily
    );
    const changeoverMinutes = rule?.durationMinutes ?? 0;
    const runMinutes = Math.ceil(
      Math.max(0, input.durationMinutes) * (100 / Math.max(1, resource.efficiencyPercent))
    );
    const start = alignToCalendar(
      new Date(Math.max(state.availableAt.getTime(), input.predecessorReady.getTime())),
      calendar
    );
    if (workstation.gmp && !canScheduleOnWorkstation(workstation.gmp, start)) {
      rows.push({
        workstationCode: code,
        workstationId: resource.workstationId,
        earliestFinish: null,
        rejectedReason: "GMP hold (qualification / cleaning)",
        selected: resource.workstationId === input.selectedWorkstationId,
      });
      continue;
    }
    const gmpCleanMinutes = workstation.gmp ? gmpCleanMinutesBeforeJob(workstation.gmp, start) : 0;
    if (!Number.isFinite(gmpCleanMinutes)) {
      rows.push({
        workstationCode: code,
        workstationId: resource.workstationId,
        earliestFinish: null,
        rejectedReason: "GMP clean minutes invalid",
        selected: resource.workstationId === input.selectedWorkstationId,
      });
      continue;
    }
    const totalMinutes =
      input.setupMinutes + gmpCleanMinutes + changeoverMinutes + runMinutes + input.teardownMinutes;
    const end = addWorkingMinutesOnCalendar(start, totalMinutes, calendar);
    rows.push({
      workstationCode: code,
      workstationId: resource.workstationId,
      earliestFinish: end.toISOString(),
      rejectedReason: null,
      selected: resource.workstationId === input.selectedWorkstationId,
    });
  }
  rows.sort((a, b) => {
    if (!a.earliestFinish) return 1;
    if (!b.earliestFinish) return -1;
    return a.earliestFinish.localeCompare(b.earliestFinish);
  });
  return rows;
}

export function printCandidateDebugTable(rows: CandidateDebugRow[], title: string): void {
  console.log(`\n[candidates] ${title}`);
  for (const row of rows) {
    const mark = row.selected ? " ← scheduled" : "";
    if (row.rejectedReason) {
      console.log(`  ${row.workstationCode}: rejected — ${row.rejectedReason}${mark}`);
    } else {
      console.log(`  ${row.workstationCode}: finish ${row.earliestFinish}${mark}`);
    }
  }
}
