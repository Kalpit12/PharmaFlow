import type { ReactNode } from "react";
import Link from "next/link";

import { AIActionProposalCard } from "@/components/ai/AIActionProposalCard";
import { AIWorkflowProposalCard } from "@/components/ai/AIWorkflowProposalCard";
import { CommunicationDraftCard } from "@/components/communications/CommunicationDraftCard";
import { AIInsightRow, AIMarker, AISparkline } from "@/components/ai/AIInsight";
import { AISuggestions } from "@/components/ai/AISuggestions";
import { Button } from "@/components/ui/button";
import type { AIResponse } from "@/lib/mock/ai";
import { cn } from "@/lib/utils";

export function AIUserMessage({ text }: { text: string }) {
  return (
    <div className="space-y-0.5" data-ai-turn="user">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">You</p>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export function AIAssistantMessage({
  response,
  onFollowUp,
  showFollowUps,
}: {
  response: AIResponse;
  onFollowUp: (question: string) => void;
  showFollowUps?: boolean;
}) {
  return (
    <article className="min-w-0 space-y-4 overflow-x-hidden work-surface p-4 sm:p-5">
      <AIMarker />
      <section>
        <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Summary</h3>
        <p className="mt-1 text-sm leading-relaxed">{response.summary}</p>
      </section>
      {response.insights && response.insights.length > 0 ? <AIInsightRow insights={response.insights} /> : null}
      {response.sparkline ? <AISparkline values={response.sparkline} label={response.sparklineLabel ?? "Trend"} /> : null}
      <section>
        <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Key signals</h3>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-relaxed text-muted-foreground">
          {response.signals.map((signal) => (
            <li key={signal} className="marker:text-foreground/40">
              <span className="text-foreground">{signal}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Recommended action</h3>
        <p className="mt-1 text-sm leading-relaxed">{response.recommendation}</p>
        {response.actionProposal ? <AIActionProposalCard proposal={response.actionProposal} /> : null}
        {response.workflowProposal ? <AIWorkflowProposalCard proposal={response.workflowProposal} /> : null}
        {response.communicationDraft ? <CommunicationDraftCard draft={response.communicationDraft} compact /> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {response.actions.map((action, index) => (
            <Button
              key={action.href + action.label}
              asChild
              size="sm"
              variant={index === 0 ? "default" : "outline"}
              className="min-h-11 sm:min-h-7"
            >
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ))}
        </div>
      </section>
      {showFollowUps && response.followUps.length > 0 ? (
        <AISuggestions questions={response.followUps} onSelect={onFollowUp} label="Follow up" />
      ) : null}
    </article>
  );
}

export function AILoadingMessage() {
  return (
    <div
      className="rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground ring-1 ring-foreground/10"
      role="status"
      aria-live="polite"
    >
      Pharmaflow is analyzing...
    </div>
  );
}

export function AIMessage({
  role,
  text,
  response,
  onFollowUp,
  showFollowUps,
}: {
  role: "user" | "assistant";
  text?: string;
  response?: AIResponse;
  onFollowUp: (question: string) => void;
  showFollowUps?: boolean;
}) {
  if (role === "user" && text) return <AIUserMessage text={text} />;
  if (response) return <AIAssistantMessage response={response} onFollowUp={onFollowUp} showFollowUps={showFollowUps} />;
  return null;
}

export function AIThread({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}
