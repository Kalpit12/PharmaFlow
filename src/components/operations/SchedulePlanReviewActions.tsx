"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ScheduleProposalView } from "@/lib/server/aps-plan";

export function SchedulePlanReviewActions({
  proposal,
  canSchedule,
}: {
  proposal: ScheduleProposalView | null;
  canSchedule: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canSchedule) return null;

  const acceptPlan = () => {
    if (!proposal) return;
    startTransition(async () => {
      setMessage(null);
      const response = await fetch(`/api/schedule-plans/${proposal.id}/accept`, { method: "POST", body: "{}" });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Accept failed.");
        return;
      }
      setMessage("Schedule accepted.");
      router.refresh();
    });
  };

  const rejectPlan = () => {
    if (!proposal) return;
    startTransition(async () => {
      setMessage(null);
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

  const reschedule = () => {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/schedule-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? "Reschedule failed.");
        return;
      }
      setMessage("New proposal generated.");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={reschedule}>
        Reschedule all
      </Button>
      {proposal?.status === "PROPOSED" ? (
        <>
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={acceptPlan}>
            Accept plan
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={rejectPlan}>
            Reject
          </Button>
        </>
      ) : null}
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
    </div>
  );
}
