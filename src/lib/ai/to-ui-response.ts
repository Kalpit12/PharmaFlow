import type { StructuredAIResponse } from "@/lib/ai/response";
import type { AIResponse } from "@/lib/mock/ai";

export function toAssistantUIResponse(response: StructuredAIResponse): AIResponse {
  const sparkline = undefined;
  return {
    summary: response.summary,
    signals: response.keySignals,
    recommendation: response.recommendedActions[0] ?? "Review the workspace data and follow up on the items above.",
    insights: response.insights.map((insight) => ({
      label: insight.title,
      value: insight.metric || insight.description || insight.category,
      delta: insight.trend,
      positive: insight.trend ? !insight.trend.includes("−") && !insight.trend.toLowerCase().includes("down") : undefined,
    })),
    sparkline,
    actions: response.actions.map((action) => ({ label: action.label, href: action.href })),
    followUps: response.followUps.map((item) => item.question),
    actionProposal: response.actionProposal,
    workflowProposal: response.workflowProposal,
    communicationDraft: response.communicationDraft,
  };
}
