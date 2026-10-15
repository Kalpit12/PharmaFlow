"use client";

import { Clock, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GanttDiffSummary, GanttLateSummary } from "@/lib/server/operations-gantt";
import type { ScheduleProposalView } from "@/lib/server/aps-plan";
import { cn } from "@/lib/utils";

export function GanttReschedulePill({
  proposal,
  diffSummary,
  canSchedule,
  scheduleStatusLine,
  lateSummary,
  showComparePlan,
  onShowComparePlanChange,
  onMessage,
}: {
  proposal: ScheduleProposalView | null;
  diffSummary: GanttDiffSummary;
  canSchedule: boolean;
  scheduleStatusLine: string;
  lateSummary: GanttLateSummary;
  showComparePlan: boolean;
  onShowComparePlanChange: (value: boolean) => void;
  onMessage?: (text: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canReview = Boolean(proposal && proposal.status === "PROPOSED" && diffSummary.hasChanges);

  if (!canSchedule) return null;

  const run = (fn: () => Promise<void>) => {
    startTransition(async () => {
      onMessage?.(null);
      await fn();
    });
  };

  const rescheduleAll = () =>
    run(async () => {
      const response = await fetch("/api/schedule-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) onMessage?.("Reschedule failed.");
      else router.refresh();
    });

  const action = (actionKey: string) =>
    run(async () => {
      const response = await fetch("/api/schedule-plans/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionKey }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) onMessage?.(payload.message ?? "Action failed.");
      else {
        onMessage?.(payload.message ?? "Proposal updated — review on the Gantt.");
        router.refresh();
      }
    });

  const acceptPlan = () => {
    if (!proposal || !canReview) return;
    run(async () => {
      const response = await fetch(`/api/schedule-plans/${proposal.id}/accept`, { method: "POST", body: "{}" });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) onMessage?.(payload.message ?? "Accept failed.");
      else router.refresh();
    });
  };

  const rejectPlan = () => {
    if (!proposal || !canReview) return;
    run(async () => {
      const response = await fetch(`/api/schedule-plans/${proposal.id}/reject`, { method: "POST", body: "{}" });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) onMessage?.(payload.message ?? "Reject failed.");
      else {
        onMessage?.("Proposal rejected.");
        router.refresh();
      }
    });
  };

  const changeoverHours = proposal ? Math.round(proposal.totalChangeoverMinutes / 60) : 0;
  const lateLine = `${lateSummary.lateJobs} late jobs · ${lateSummary.lateOrders} late orders`;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-3 left-1/2 z-50 flex max-w-[min(960px,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/95 px-4 py-2 text-sm shadow-md backdrop-blur-sm",
        canReview && "flex-wrap justify-center gap-x-3 py-2.5"
      )}
      role="toolbar"
      aria-label="Schedule actions"
    >
      {canReview ? (
        <>
          <span className="text-xs text-muted-foreground sm:text-sm">
            {scheduleStatusLine ||
              `Proposal V${proposal!.version} · ${diffSummary.jobsMoved} moved · ${lateLine} · ${changeoverHours}h changeover`}
          </span>
          <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" disabled={pending} onClick={rejectPlan}>
            Reject
          </Button>
          <Button type="button" size="sm" className="h-8 rounded-full" disabled={pending} onClick={acceptPlan}>
            Accept plan
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 rounded-full"
            disabled={pending}
            onClick={rescheduleAll}
          >
            <RefreshCw className={cn("size-3.5", pending && "animate-spin")} aria-hidden />
            Reschedule all
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="outline" className="size-8 rounded-full" disabled={pending} aria-label="More schedule actions">
                <Clock className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuItem onClick={() => onShowComparePlanChange(!showComparePlan)}>
                {showComparePlan ? "Hide compare with current plan" : "Compare with current plan"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => action("BULLDOZER")}>Bulldozer reschedule</DropdownMenuItem>
              <DropdownMenuItem onClick={() => action("UNSCHEDULED_ONLY")}>Schedule unscheduled only</DropdownMenuItem>
              <DropdownMenuItem disabled title="Configure in global rules (gear)">
                Autopilot modes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}
