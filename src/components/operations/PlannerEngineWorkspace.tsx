"use client";

import { useCallback, useState, useTransition } from "react";

import { SchedulePlanReviewActions } from "@/components/operations/SchedulePlanReviewActions";
import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlannerEngineActions } from "@/components/operations/PlannerEngineActions";
import type { PlannerEngineSnapshot, PlanningPolicyView } from "@/lib/server/aps-plan";

function clampWeight(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function PlannerEngineWorkspace({
  initial,
  canGlobalRules,
}: {
  initial: PlannerEngineSnapshot;
  canGlobalRules: boolean;
}) {
  const [policy, setPolicy] = useState<PlanningPolicyView>(initial.policy);
  const proposal = initial.proposal;
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const savePolicy = useCallback(() => {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/planning-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priorityWeight: policy.priorityWeight,
          dueDateWeight: policy.dueDateWeight,
          changeoverWeight: policy.changeoverWeight,
          utilizationWeight: policy.utilizationWeight,
          leadTimeWeight: policy.leadTimeWeight,
          onTimeCountWeight: policy.onTimeCountWeight,
          customerPriorityWeight: policy.customerPriorityWeight,
          similarJobsWeight: policy.similarJobsWeight,
          eligibilityWeight: policy.eligibilityWeight,
          considerMaterials: policy.considerMaterials,
          considerEligibility: policy.considerEligibility,
          freezeMinutes: policy.freezeMinutes,
          useGlobalOptimizer: policy.useGlobalOptimizer,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; policy?: PlanningPolicyView };
      if (!response.ok) {
        setMessage(payload.message ?? "Unable to save global rules.");
        return;
      }
      if (payload.policy) setPolicy(payload.policy);
      setMessage("Global rules saved.");
    });
  }, [policy]);

  const weightTotal =
    policy.priorityWeight +
    policy.dueDateWeight +
    policy.changeoverWeight +
    policy.utilizationWeight +
    policy.leadTimeWeight +
    policy.onTimeCountWeight +
    policy.customerPriorityWeight +
    policy.similarJobsWeight +
    policy.eligibilityWeight;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="work-surface p-4">
        <p className="text-sm text-muted-foreground">
          Phase 12 — SkyPlanner-style engine actions (bulldozer, unscheduled-only, workstation scope, fast track) plus extended
          global rule weights. Plans are proposed until a planner accepts them.
        </p>
      </section>

      {!canGlobalRules ? (
        <section className="work-surface p-4 text-sm text-muted-foreground">
          Global rules are read-only for your planner role. You can still run reschedule and accept proposals when permitted.
        </section>
      ) : null}

      <section className="work-surface grid gap-4 p-4 lg:grid-cols-2">
        <div className={canGlobalRules ? undefined : "pointer-events-none opacity-60"}>
          <h3 className="text-sm font-medium">Global rules (weights 0–100)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Phase 3 acceptance focuses on due date vs changeover; other sliders remain for parity with SkyPlanner.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["dueDateWeight", "Due date / lateness"],
                ["onTimeCountWeight", "On-time completion count"],
                ["leadTimeWeight", "Minimise lead time"],
                ["changeoverWeight", "Cleaning & changeover"],
                ["similarJobsWeight", "Similar jobs in succession"],
                ["priorityWeight", "Order priority"],
                ["customerPriorityWeight", "Customer priority"],
                ["eligibilityWeight", "Near eligibility dates"],
                ["utilizationWeight", "Preferred lines"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`w-${key}`}>{label}</Label>
                <Input
                  id={`w-${key}`}
                  type="number"
                  min={0}
                  max={100}
                  value={policy[key]}
                  onChange={(event) =>
                    setPolicy((prev) => ({ ...prev, [key]: clampWeight(Number(event.target.value)) }))
                  }
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Combined weight: {weightTotal} (need not equal 100).</p>
          <div className="mt-3 space-y-2">
            <Label htmlFor="freeze">Freeze window (minutes)</Label>
            <Input
              id="freeze"
              type="number"
              min={0}
              value={policy.freezeMinutes}
              onChange={(event) =>
                setPolicy((prev) => ({ ...prev, freezeMinutes: Math.max(0, Number.parseInt(event.target.value, 10) || 0) }))
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={policy.considerMaterials}
                onChange={(event) => setPolicy((prev) => ({ ...prev, considerMaterials: event.target.checked }))}
              />
              Consider materials (MRP)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={policy.considerEligibility}
                onChange={(event) => setPolicy((prev) => ({ ...prev, considerEligibility: event.target.checked }))}
              />
              Consider eligibility / earliest start
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={policy.useGlobalOptimizer}
                onChange={(event) => setPolicy((prev) => ({ ...prev, useGlobalOptimizer: event.target.checked }))}
              />
              Use global optimizer (local search after forward pass)
            </label>
          </div>
          <Button type="button" className="mt-4" disabled={pending} onClick={savePolicy}>
            Save global rules
          </Button>
        </div>

        <div>
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
                <li>{proposal.movedOrders} orders moved · {proposal.lateOrders} late · {proposal.totalChangeoverMinutes} min changeover</li>
                <li>{proposal.lockedOrders} locked · {proposal.blockedOrders} material-blocked</li>
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No active proposal. Run reschedule to generate one.</p>
          )}
        </div>
      </section>

      <section className="work-surface p-4">
        <PlannerEngineActions />
      </section>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
