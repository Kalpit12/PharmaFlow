"use client";

import { PlannerEngineActions } from "@/components/operations/PlannerEngineActions";
import { PlannerGlobalRulesPanel } from "@/components/operations/PlannerGlobalRulesPanel";
import { SchedulePlanReviewActions } from "@/components/operations/SchedulePlanReviewActions";
import { StatusBadge } from "@/components/ds/status-badge";
import type { PlannerEngineSnapshot } from "@/lib/server/aps-plan";

export function PlannerEngineWorkspace({
  initial,
  canGlobalRules,
}: {
  initial: PlannerEngineSnapshot;
  canGlobalRules: boolean;
}) {
  const proposal = initial.proposal;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="work-surface p-4">
        <p className="text-sm text-muted-foreground">
          Phase 12 — SkyPlanner-style engine actions (bulldozer, unscheduled-only, workstation scope, fast track) plus extended
          global rule weights. Plans are proposed until a planner accepts them.
        </p>
      </section>

      <PlannerGlobalRulesPanel initialPolicy={initial.policy} canEdit={canGlobalRules} variant="full" />

      <section className="work-surface p-4">
        <h3 className="text-sm font-medium">Propose & accept</h3>
        <div className="mt-4">
          <SchedulePlanReviewActions proposal={proposal} canSchedule />
        </div>
        {proposal ? (
          <div className="mt-4 space-y-2 rounded-md border border-border p-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="intel">{proposal.name}</StatusBadge>
              <StatusBadge tone={proposal.lateOrders > 0 ? "warning" : "neutral"}>{proposal.status}</StatusBadge>
            </div>
            <p className="text-muted-foreground">{proposal.summary}</p>
            <ul className="text-xs text-muted-foreground">
              <li>
                {proposal.movedJobs} jobs moved · {proposal.lockedOrders} orders with frozen/locked ops ·{" "}
                {proposal.blockedOrders} material-blocked · {proposal.lateOrders} late ·{" "}
                {proposal.totalChangeoverMinutes} min changeover
              </li>
              {proposal.lockBreakdown ? (
                <li>
                  Locks: {proposal.lockBreakdown.manualOrderLocks} manual order ·{" "}
                  {proposal.lockBreakdown.runningTimeLockFrozen} in running-time window ·{" "}
                  {proposal.lockBreakdown.inProgressOrPaused} in progress ·{" "}
                  {proposal.lockBreakdown.manualOperationLocks} manual op
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No active proposal. Run reschedule to generate one.</p>
        )}
      </section>

      <section className="work-surface p-4">
        <PlannerEngineActions />
      </section>
    </div>
  );
}
