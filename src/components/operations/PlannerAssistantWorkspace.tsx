"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlannerAssistantDraftView, PlannerAssistantTurn } from "@/lib/server/planner-assistant";

type ChatLine = PlannerAssistantTurn & { id: string };

export function PlannerAssistantWorkspace() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Planner assistant (beta) — I draft orders, reschedule proposals, and downtime what-ifs. You accept before anything is saved or proposed.",
    },
  ]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    const message = input.trim();
    if (!message) return;
    setInput("");
    setError(null);
    setLines((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: message }]);
    startTransition(async () => {
      const response = await fetch("/api/planner-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const payload = (await response.json()) as { turn?: PlannerAssistantTurn; message?: string };
      if (!response.ok) {
        setError(payload.message ?? "Assistant request failed.");
        return;
      }
      if (payload.turn) {
        setLines((prev) => [...prev, { ...payload.turn!, id: `a-${Date.now()}` }]);
      }
    });
  };

  const decide = (draft: PlannerAssistantDraftView, decision: "accept" | "reject") => {
    startTransition(async () => {
      setError(null);
      const response = await fetch(`/api/planner-assistant/drafts/${draft.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await response.json()) as { summary?: string; message?: string };
      if (!response.ok) {
        setError(payload.message ?? "Could not update draft.");
        return;
      }
      setLines((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: "assistant",
          text:
            decision === "accept"
              ? `Accepted: ${payload.summary ?? "Done."} Refreshing planner data.`
              : "Draft rejected — no changes made.",
        },
      ]);
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-[480px] min-w-0 flex-col gap-3">
      <section className="work-surface flex-1 space-y-3 overflow-y-auto p-4">
        {lines.map((line) => (
          <div key={line.id} className={line.role === "user" ? "text-right" : "text-left"}>
            <div
              className={
                line.role === "user"
                  ? "ml-auto inline-block max-w-[90%] rounded-sm bg-primary/10 px-3 py-2 text-sm"
                  : "max-w-[95%] whitespace-pre-wrap text-sm text-muted-foreground"
              }
            >
              {line.text}
            </div>
            {line.drafts?.map((draft) => (
              <div key={draft.id} className="mt-2 max-w-md rounded-sm border border-border bg-background p-3 text-left text-sm">
                <p className="font-medium">{draft.summary}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{draft.detail}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || !draft.canAccept}
                    onClick={() => decide(draft, "accept")}
                  >
                    Accept draft
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => decide(draft, "reject")}>
                    Reject
                  </Button>
                </div>
                {!draft.canAccept ? (
                  <p className="mt-2 text-xs text-muted-foreground">Your role cannot accept planner writes.</p>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </section>

      <div className="work-surface flex flex-wrap gap-2 p-3">
        <Input
          className="min-w-[200px] flex-1"
          placeholder='e.g. "Schedule unscheduled jobs" or "20 batches of Amoxicillin due in 3 weeks"'
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send();
          }}
        />
        <Button type="button" disabled={pending} onClick={send}>
          Send
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
