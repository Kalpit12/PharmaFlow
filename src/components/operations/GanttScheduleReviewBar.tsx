"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { GanttDiffSummary } from "@/lib/server/operations-gantt";
import type { ScheduleProposalView } from "@/lib/server/aps-plan";

export function GanttScheduleReviewBar({
  proposal,
  diffSummary,
  canSchedule,
  scheduleStatusLine,
}: {
  proposal: ScheduleProposalView | null;
  diffSummary: GanttDiffSummary;
  canSchedule: boolean;
  scheduleStatusLine: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canReview = Boolean(proposal && proposal.status === "PROPOSED" && diffSummary.hasChanges);

  const acceptPlan = () => {
    if (!proposal || !canReview) return;
    startTransition(async () => {
      const response = await fetch(`/api/schedule-plans/${proposal.id}/accept`, { method: "POST", body: "{}" });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Accept failed.");
        return;
      }
      router.refresh();
    });
  };

  const rejectPlan = () => {
    if (!proposal || !canReview) return;
    startTransition(async () => {
      const response = await fetch(`/api/schedule-plans/${proposal.id}/reject`, { method: "POST", body: "{}" });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Reject failed.");
        return;
      }
      setMessage("Proposal rejected.");
      router.refresh();
    });
  };

  const bulldozer = () => {
    startTransition(async () => {
      const response = await fetch("/api/schedule-plans/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "BULLDOZER" }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Bulldozer failed.");
        return;
      }
      setMessage("Bulldozer proposal ready — review ghost outlines.");
      router.refresh();
    });
  };

  const rescheduleAll = () => {
    startTransition(async () => {
      const response = await fetch("/api/schedule-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) {
        setMessage("Reschedule failed.");
        return;
      }
      router.refresh();
    });
  };

  if (!canSchedule) return null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={rescheduleAll}>
          Reschedule all
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={bulldozer}>
          Bulldozer
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending || !canReview} onClick={rejectPlan}>
          Reject
        </Button>
        <Button type="button" size="sm" disabled={pending || !canReview} onClick={acceptPlan}>
          Accept plan
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{scheduleStatusLine}</p>
      {message ? <p className="text-xs text-amber-700 dark:text-amber-300">{message}</p> : null}
    </div>
  );
}
