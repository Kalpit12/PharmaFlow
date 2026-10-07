"use client";

import { Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { OperationsView } from "@/lib/server/operations";
import type { StatusTone } from "@/types/status";

function modeLabel(mode: OperationsView["policy"]["autopilotMode"]): string {
  if (mode === "AUTO_ACCEPT_UNLOCKED") return "Auto-accept unlocked";
  if (mode === "PROPOSE_ONLY") return "Propose only";
  return "Off";
}

function stamp(iso: string | null): string {
  if (!iso) return "Unscheduled";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
}

export function ScheduleControlPanel({
  data,
  pending,
  onRescheduleAll,
  onAccept,
  onReject,
  onSavePolicy,
}: {
  data: OperationsView;
  pending: boolean;
  onRescheduleAll: () => void;
  onAccept: () => void;
  onReject: () => void;
  onSavePolicy: (patch: Partial<OperationsView["policy"]>) => void;
}) {
  const proposal = data.proposal;
  const proposed = proposal && (proposal.status === "PROPOSED" || proposal.status === "DRAFT");
  const tone: StatusTone =
    data.policy.autopilotMode === "AUTO_ACCEPT_UNLOCKED"
      ? "warning"
      : data.policy.autopilotMode === "PROPOSE_ONLY"
        ? "info"
        : "neutral";

  return (
    <section aria-label="Reschedule and planning policy" className="min-w-0 work-surface p-3">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">Reschedule all</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Builds a versioned proposal from routings, calendars, changeovers, and material constraints. Frozen work
            inside {data.policy.freezeMinutes} minutes and locked operations stay put until you accept.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge tone={tone}>Autopilot {modeLabel(data.policy.autopilotMode)}</StatusBadge>
            <span className="text-muted-foreground">
              Weights {data.policy.priorityWeight}/{data.policy.dueDateWeight}/{data.policy.changeoverWeight}/
              {data.policy.utilizationWeight}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.capabilities.canSchedule ? (
            <Button type="button" size="sm" disabled={pending} onClick={onRescheduleAll}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Reschedule all"}
            </Button>
          ) : null}
        </div>
      </div>

      {data.capabilities.canSchedule ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSavePolicy({
              priorityWeight: Number(form.get("priorityWeight")),
              dueDateWeight: Number(form.get("dueDateWeight")),
              changeoverWeight: Number(form.get("changeoverWeight")),
              utilizationWeight: Number(form.get("utilizationWeight")),
              freezeMinutes: Number(form.get("freezeMinutes")),
              autopilotMode: String(form.get("autopilotMode")) as OperationsView["policy"]["autopilotMode"],
            });
          }}
        >
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Priority</span>
            <input
              name="priorityWeight"
              type="number"
              min={0}
              max={100}
              defaultValue={data.policy.priorityWeight}
              className="h-9 rounded-md border border-border bg-background px-2"
            />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Due date</span>
            <input
              name="dueDateWeight"
              type="number"
              min={0}
              max={100}
              defaultValue={data.policy.dueDateWeight}
              className="h-9 rounded-md border border-border bg-background px-2"
            />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Changeover</span>
            <input
              name="changeoverWeight"
              type="number"
              min={0}
              max={100}
              defaultValue={data.policy.changeoverWeight}
              className="h-9 rounded-md border border-border bg-background px-2"
            />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Utilization</span>
            <input
              name="utilizationWeight"
              type="number"
              min={0}
              max={100}
              defaultValue={data.policy.utilizationWeight}
              className="h-9 rounded-md border border-border bg-background px-2"
            />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Freeze (min)</span>
            <input
              name="freezeMinutes"
              type="number"
              min={0}
              max={10080}
              defaultValue={data.policy.freezeMinutes}
              className="h-9 rounded-md border border-border bg-background px-2"
            />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Autopilot</span>
            <select
              name="autopilotMode"
              defaultValue={data.policy.autopilotMode}
              className="h-9 rounded-md border border-border bg-background px-2"
            >
              <option value="OFF">Off — propose only after Reschedule all</option>
              <option value="PROPOSE_ONLY">Propose only</option>
              <option value="AUTO_ACCEPT_UNLOCKED">Auto-accept unlocked</option>
            </select>
          </label>
          <div className="sm:col-span-2 lg:col-span-6">
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              Save policy
            </Button>
          </div>
        </form>
      ) : null}

      {proposed ? (
        <div className="mt-3 rounded-sm border border-border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{proposal.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{proposal.summary}</p>
            </div>
            {data.capabilities.canSchedule ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={pending} onClick={onAccept}>
                  Accept unlocked
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onReject}>
                  Reject
                </Button>
              </div>
            ) : null}
          </div>
          <ol className="mt-3 max-h-48 space-y-1 overflow-auto text-xs">
            {proposal.orders.slice(0, 12).map((order) => (
              <li key={order.orderNumber} className="flex flex-wrap justify-between gap-2 border-t border-border/60 py-1">
                <span className="font-medium">
                  {order.orderNumber}
                  {order.isLocked ? " · frozen" : ""}
                </span>
                <span className="text-muted-foreground">
                  {stamp(order.previousStart)} → {stamp(order.proposedStart)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          No open proposal. Reschedule all compares a new plan against the accepted schedule without moving work until
          you accept.
        </p>
      )}
    </section>
  );
}
