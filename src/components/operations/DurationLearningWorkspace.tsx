"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusBadge } from "@/components/ds/status-badge";
import { Button } from "@/components/ui/button";
import type { DurationLearningSnapshot } from "@/lib/server/duration-learning";
import { cn } from "@/lib/utils";

function minutesLabel(value: number): string {
  if (value < 60) return `${value} min`;
  const h = Math.floor(value / 60);
  const m = value % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function DurationLearningWorkspace({ data }: { data: DurationLearningSnapshot }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const accept = (routingOperationId: string, suggestedRunMinutes: number) => {
    setBusyId(routingOperationId);
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/operations/duration-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routingOperationId, suggestedRunMinutes }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      setBusyId(null);
      setMessage({ tone: response.ok ? "ok" : "error", text: payload.message ?? (response.ok ? "Updated." : "Failed.") });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Reporting</p>
        <h1 className="text-xl font-semibold tracking-tight">Duration learning</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Logged run time (pauses excluded) compared with planned time for steps completed in the last {data.lookbackDays} days.
          A step needs at least {data.minSamples} clean timelogs and a 10% gap before a new run time is suggested. Nothing
          changes until a head planner accepts it, and every acceptance is audited.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        {data.completedOperations} completed steps in the window · {data.suggestions.length} suggestion
        {data.suggestions.length === 1 ? "" : "s"}
      </p>

      {message ? (
        <p className={cn("text-sm", message.tone === "error" ? "text-danger" : "text-success")}>{message.text}</p>
      ) : null}

      {data.suggestions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          No suggestions yet. Planned times match the shop floor within 10%, or there are not enough Start/Stop logs.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Product · step</th>
                <th className="px-3 py-2 text-right font-medium">Current</th>
                <th className="px-3 py-2 text-right font-medium">Suggested</th>
                <th className="px-3 py-2 text-right font-medium">Logged ÷ planned</th>
                <th className="px-3 py-2 font-medium">Evidence</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.suggestions.map((row) => {
                const slower = row.medianRatio > 1;
                return (
                  <tr key={row.routingOperationId} className="border-t border-border align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium">{row.productName}</p>
                      <p className="text-muted-foreground">
                        {row.stepName} <span className="font-mono text-xs">({row.stepCode})</span>
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{minutesLabel(row.currentRunMinutes)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{minutesLabel(row.suggestedRunMinutes)}</td>
                    <td className={cn("px-3 py-3 text-right tabular-nums", slower ? "text-danger" : "text-success")}>
                      ×{row.medianRatio.toFixed(2)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={row.confidence === "HIGH" ? "success" : row.confidence === "MEDIUM" ? "info" : "neutral"}>
                          {row.confidence}
                        </StatusBadge>
                        <span className="text-muted-foreground">{row.sampleCount} logs</span>
                      </div>
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {row.byWorkstation.slice(0, 3).map((ws) => (
                          <li key={ws.workstationId ?? "none"}>
                            {(ws.workstationId && row.workstationNames[ws.workstationId]) || "Unassigned"} · {ws.sampleCount} · ×
                            {ws.medianRatio.toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {data.canAccept ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => accept(row.routingOperationId, row.suggestedRunMinutes)}
                        >
                          {busyId === row.routingOperationId ? "Saving…" : "Accept"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Head planner accepts</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
