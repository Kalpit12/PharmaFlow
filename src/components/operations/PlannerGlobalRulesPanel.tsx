"use client";

import type { AutopilotMode } from "@prisma/client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatGanttDateTime } from "@/lib/operations/gantt-format";
import type { PlanningPolicyView } from "@/lib/server/aps-plan";
import { cn } from "@/lib/utils";

function clampWeight(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

type WeightKey =
  | "priorityWeight"
  | "dueDateWeight"
  | "changeoverWeight"
  | "utilizationWeight"
  | "leadTimeWeight"
  | "onTimeCountWeight"
  | "customerPriorityWeight"
  | "similarJobsWeight"
  | "eligibilityWeight";

const WEIGHT_FIELDS: ReadonlyArray<{ key: WeightKey; label: string; ganttPrimary?: boolean }> = [
  { key: "dueDateWeight", label: "Due date / lateness", ganttPrimary: true },
  { key: "priorityWeight", label: "Order priority", ganttPrimary: true },
  { key: "changeoverWeight", label: "Cleaning & changeover", ganttPrimary: true },
  { key: "onTimeCountWeight", label: "On-time completion count", ganttPrimary: true },
  { key: "leadTimeWeight", label: "Minimise lead time", ganttPrimary: true },
  { key: "similarJobsWeight", label: "Similar jobs in succession" },
  { key: "customerPriorityWeight", label: "Customer priority" },
  { key: "eligibilityWeight", label: "Near eligibility dates" },
  { key: "utilizationWeight", label: "Preferred lines" },
];

const AUTOPILOT_OPTIONS: Array<{ value: AutopilotMode; label: string; hint: string }> = [
  { value: "OFF", label: "Off", hint: "Manual propose and accept only" },
  { value: "PROPOSE_ONLY", label: "Propose only", hint: "Autopilot creates proposals for review" },
  {
    value: "AUTO_ACCEPT_UNLOCKED",
    label: "Auto-accept unlocked",
    hint: "Accept proposals when orders are not locked",
  },
];

export function PlannerGlobalRulesPanel({
  initialPolicy,
  canEdit,
  variant = "full",
  collapsible = false,
  defaultOpen = true,
  onSaved,
}: {
  initialPolicy: PlanningPolicyView;
  canEdit: boolean;
  variant?: "compact" | "full";
  collapsible?: boolean;
  defaultOpen?: boolean;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [policy, setPolicy] = useState<PlanningPolicyView>(initialPolicy);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const savePolicy = useCallback(() => {
    if (!canEdit) return;
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
          autopilotMode: policy.autopilotMode,
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
      onSaved?.();
    });
  }, [canEdit, onSaved, policy]);

  const fields =
    variant === "compact" ? WEIGHT_FIELDS.filter((row) => row.ganttPrimary) : WEIGHT_FIELDS;

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

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-medium">Global rules</h3>
        <p className="text-xs text-muted-foreground">
          Optimizer weights, running-time lock, and Autopilot — applied on the next reschedule.
        </p>
      </div>
      {collapsible ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {open ? "Hide" : "Show"}
        </button>
      ) : null}
    </div>
  );

  const body = (
    <div className={cn(!canEdit && "pointer-events-none opacity-60")}>
      {!canEdit ? (
        <p className="mb-3 text-xs text-muted-foreground">Read-only for your planner role.</p>
      ) : null}
      <div className={cn("grid gap-4", variant === "compact" ? "lg:grid-cols-2" : "lg:grid-cols-2")}>
        <div className="space-y-3">
          {fields.map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <Label htmlFor={`gr-${String(key)}`}>{label}</Label>
                <span className="tabular-nums text-muted-foreground">{policy[key]}</span>
              </div>
              <input
                id={`gr-${String(key)}`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={policy[key]}
                disabled={!canEdit || pending}
                className="h-2 w-full cursor-pointer accent-primary"
                onChange={(event) =>
                  setPolicy((prev) => ({ ...prev, [key]: clampWeight(Number(event.target.value)) }))
                }
              />
            </div>
          ))}
          {variant === "full" ? (
            <p className="text-xs text-muted-foreground">Combined weight: {weightTotal} (need not equal 100).</p>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <Label htmlFor="gr-freeze">Running time lock (minutes)</Label>
            <input
              id="gr-freeze"
              type="range"
              min={0}
              max={480}
              step={15}
              value={policy.freezeMinutes}
              disabled={!canEdit || pending}
              className="h-2 w-full cursor-pointer accent-amber-600"
              onChange={(event) =>
                setPolicy((prev) => ({
                  ...prev,
                  freezeMinutes: Math.max(0, Number.parseInt(event.target.value, 10) || 0),
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Jobs that already started within this window stay fixed until{" "}
              <time dateTime={policy.freezeUntil}>{formatGanttDateTime(policy.freezeUntil)}</time>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gr-autopilot">Autopilot</Label>
            <select
              id="gr-autopilot"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={policy.autopilotMode}
              disabled={!canEdit || pending}
              onChange={(event) =>
                setPolicy((prev) => ({ ...prev, autopilotMode: event.target.value as AutopilotMode }))
              }
            >
              {AUTOPILOT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {AUTOPILOT_OPTIONS.find((row) => row.value === policy.autopilotMode)?.hint}
            </p>
          </div>

          {variant === "full" ? (
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={policy.considerMaterials}
                  disabled={!canEdit || pending}
                  onChange={(event) => setPolicy((prev) => ({ ...prev, considerMaterials: event.target.checked }))}
                />
                Consider materials (MRP)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={policy.considerEligibility}
                  disabled={!canEdit || pending}
                  onChange={(event) => setPolicy((prev) => ({ ...prev, considerEligibility: event.target.checked }))}
                />
                Consider eligibility / earliest start
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={policy.useGlobalOptimizer}
                  disabled={!canEdit || pending}
                  onChange={(event) => setPolicy((prev) => ({ ...prev, useGlobalOptimizer: event.target.checked }))}
                />
                Use global optimizer (local search after forward pass)
              </label>
            </div>
          ) : null}

          {canEdit ? (
            <Button type="button" size="sm" disabled={pending} onClick={savePolicy}>
              Save global rules
            </Button>
          ) : null}
        </div>
      </div>
      {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );

  if (collapsible && !open) {
    return (
      <section className="work-surface p-3">
        {header}
        <p className="mt-1 text-xs text-muted-foreground">
          Autopilot: {policy.autopilotMode.replace(/_/g, " ").toLowerCase()} · Lock: {policy.freezeMinutes} min
        </p>
      </section>
    );
  }

  return (
    <section className="work-surface space-y-3 p-4">
      {header}
      {body}
    </section>
  );
}
