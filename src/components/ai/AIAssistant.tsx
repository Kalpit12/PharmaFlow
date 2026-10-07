"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AIComposer } from "@/components/ai/AIComposer";
import { AILoadingMessage, AIMessage, AIThread } from "@/components/ai/AIMessage";
import { AIWelcome } from "@/components/ai/AIWelcome";
import { Button } from "@/components/ui/button";
import { toAssistantUIResponse } from "@/lib/ai/to-ui-response";
import type { AIResponse } from "@/lib/mock/ai";
import { getTenant } from "@/lib/tenant";

type Turn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; response: AIResponse };

export function AIAssistant() {
  const tenant = getTenant();
  const searchParams = useSearchParams();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [dataLabel, setDataLabel] = useState("Workspace");
  const threadRef = useRef<HTMLDivElement>(null);
  const autoAsked = useRef(false);

  useEffect(() => {
    const root = threadRef.current;
    if (!root) return;
    const lastUser = root.querySelector('[data-ai-turn="user"]:last-of-type');
    lastUser?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [turns, pending]);

  const ask = async (question: string) => {
    if (pending) return;
    const userTurn: Turn = { id: crypto.randomUUID(), role: "user", text: question };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setPending(true);

    const conversation = turns.slice(-6).map((turn) =>
      turn.role === "user"
        ? { role: "user" as const, content: turn.text }
        : { role: "assistant" as const, content: turn.response.summary }
    );

    try {
      const result = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, conversation }),
      });
      const payload = (await result.json()) as {
        response?: Parameters<typeof toAssistantUIResponse>[0];
        message?: string;
      };
      if (!result.ok || !payload.response) {
        setTurns((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            response: {
              summary: payload.message ?? "Pharmaflow AI is temporarily unavailable. Please try again.",
              signals: [],
              recommendation: "Try the question again in a moment.",
              actions: [],
              followUps: ["What needs my attention today?", "How are RFQs performing?"],
            },
          },
        ]);
        return;
      }
      if (payload.response.metadata.dataMode === "demonstration") setDataLabel("Demo workspace data");
      else setDataLabel("Workspace data");
      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", response: toAssistantUIResponse(payload.response!) },
      ]);
    } catch {
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          response: {
            summary: "Pharmaflow AI is temporarily unavailable. Please try again.",
            signals: [],
            recommendation: "Try the question again in a moment.",
            actions: [],
            followUps: [],
          },
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (autoAsked.current) return;
    const q = searchParams.get("q")?.trim();
    if (!q) return;
    autoAsked.current = true;
    void ask(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep link
  }, [searchParams]);

  const reset = () => {
    setTurns([]);
    setPending(false);
    setDataLabel("Workspace");
  };

  const latestAssistant = [...turns]
    .reverse()
    .find((turn): turn is Extract<Turn, { role: "assistant" }> => turn.role === "assistant");
  const latestInsights = latestAssistant?.response.insights ?? null;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl min-w-0 flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pharmaflow AI</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Your intelligent business analyst.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Context: {tenant.brand} · {dataLabel}
          </p>
        </div>
        {turns.length > 0 ? (
          <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-7" onClick={reset}>
            New conversation
          </Button>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(0,40rem)_16rem] xl:justify-center">
        <div className="flex min-h-0 min-w-0 flex-col">
          <div ref={threadRef} className="scrollbar-themed min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-0.5">
            {turns.length === 0 && !pending ? <AIWelcome onSelect={ask} /> : null}
            {turns.length > 0 || pending ? (
              <AIThread>
                {turns.map((turn, index) => {
                  const lastAssistant = !pending && turns.findLastIndex((item) => item.role === "assistant") === index;
                  return turn.role === "user" ? (
                    <AIMessage key={turn.id} role="user" text={turn.text} onFollowUp={ask} />
                  ) : (
                    <AIMessage
                      key={turn.id}
                      role="assistant"
                      response={turn.response}
                      onFollowUp={ask}
                      showFollowUps={lastAssistant}
                    />
                  );
                })}
                {pending ? <AILoadingMessage /> : null}
              </AIThread>
            ) : null}
          </div>
          <div className="shrink-0 border-t border-border/60 bg-background pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <AIComposer disabled={pending} onSubmit={ask} />
          </div>
        </div>

        {latestInsights && latestInsights.length > 0 ? (
          <aside className="hidden min-h-0 xl:block">
            <div className="work-surface p-4">
              <h2 className="text-sm font-semibold tracking-tight">Latest context</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">From the most recent analysis</p>
              <dl className="mt-3 space-y-3">
                {latestInsights.map((insight) => (
                  <div key={`${insight.label}-${insight.value}`}>
                    <dt className="text-[11px] text-muted-foreground">{insight.label}</dt>
                    <dd className="text-sm font-medium tabular-nums">
                      {insight.value}
                      {insight.delta ? (
                        <span className={insight.positive === false ? "ml-2 text-xs text-danger" : "ml-2 text-xs text-success"}>
                          {insight.delta}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
