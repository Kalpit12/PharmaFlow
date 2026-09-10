import { detectIntent } from "@/lib/ai/detect-intent";
import { demoAIProvider } from "@/lib/ai/mock-adapter";
import { openaiAIProvider } from "@/lib/ai/openai-provider";
import type { ConversationTurn } from "@/lib/ai/provider";
import type { StructuredAIResponse } from "@/lib/ai/response";
import { actionsForIntent, fallbackStructuredResponse } from "@/lib/ai/validate-response";
import { proposeAction } from "@/lib/server/actions";
import { proposeCommunication } from "@/lib/server/communications";
import { proposeWorkflow } from "@/lib/server/workflows";
import { collectToolContext } from "@/lib/server/ai-data";
import { ServerError, type TenantContext } from "@/lib/server/errors";
import { getTenant } from "@/lib/server/services/tenant";

const UNSUPPORTED_SUMMARY =
  "Pharmaflow analyzes your business data. I can help with sales, products, customers, RFQs, regions, daily priorities, and operational opportunities.";

const MEDICAL_SUMMARY =
  "Pharmaflow analyzes business and operational data rather than providing medical advice. Ask about sales, products, customers, RFQs, or regional performance.";

export function getAIProvider() {
  if (process.env.AI_PROVIDER === "mock") return demoAIProvider;
  return openaiAIProvider;
}

export async function runProductionOrchestrator(input: {
  ctx: TenantContext;
  question: string;
  history?: ConversationTurn[];
}): Promise<StructuredAIResponse> {
  const question = input.question.trim();
  const intent = detectIntent(question);
  const tenant = await getTenant(input.ctx);
  const dataMode = tenant.status === "DEMO" ? "demonstration" : "live";

  if (intent.intent === "UNSUPPORTED") {
    const medical = /\b(diagnos|dosage|prescribe|treatment|medical advice|patient)\b/i.test(question);
    return {
      ...fallbackStructuredResponse(intent.intent, dataMode, intent.timeRange, [], medical ? MEDICAL_SUMMARY : UNSUPPORTED_SUMMARY),
      followUps: [
        { question: "What is our revenue performance?" },
        { question: "How are RFQs performing?" },
        { question: "Which customers need attention?" },
      ],
    };
  }

  const started = Date.now();
  const context = await collectToolContext(input.ctx, intent, dataMode, tenant.name);
  const provider = getAIProvider();
  const explainOnly =
    intent.intent === "FORECAST" ||
    intent.intent === "SCENARIO" ||
    intent.intent === "PROCUREMENT_RFQ" ||
    intent.intent === "PURCHASE_ORDER" ||
    intent.intent === "SUPPLIER_PERFORMANCE" ||
    intent.intent === "EXECUTIVE_REPORT";

  try {
    const response = await provider.generateResponse({
      question,
      context,
      history: input.history,
    });
    console.info(
      JSON.stringify({
        event: "ai_request",
        intent: intent.intent,
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        durationMs: Date.now() - started,
        toolCount: context.toolsUsed.length,
        provider: provider.id,
      })
    );
    const draftedCommunication =
      !explainOnly && response.proposedCommunicationDraft
        ? await proposeCommunication(input.ctx, response.proposedCommunicationDraft)
        : { status: "skipped" as const };
    const wantsDraft = /\b(draft|prepare a follow-up|prepare a message)\b/i.test(question);
    const draftedWorkflow =
      !explainOnly &&
      !(wantsDraft && draftedCommunication.status === "created") &&
      response.proposedWorkflowDraft
        ? await proposeWorkflow(input.ctx, response.proposedWorkflowDraft)
        : null;
    const draftedAction =
      !explainOnly &&
      !draftedWorkflow &&
      draftedCommunication.status !== "created" &&
      response.proposedActionDraft
        ? await proposeAction(input.ctx, response.proposedActionDraft)
        : null;
    const clarification = draftedCommunication.status === "clarification" ? draftedCommunication.message : null;
    return {
      ...response,
      summary: clarification ?? response.summary,
      proposedActionDraft: undefined,
      proposedWorkflowDraft: undefined,
      proposedCommunicationDraft: undefined,
      communicationDraft: draftedCommunication.status === "created" ? draftedCommunication.draft : undefined,
      workflowProposal: draftedWorkflow ?? undefined,
      actionProposal: draftedAction ?? undefined,
      actions: actionsForIntent(intent.intent),
      metadata: {
        intent: intent.intent,
        dataMode,
        timeRange: intent.timeRange,
        toolsUsed: context.toolsUsed,
        sources: dataMode === "demonstration" ? ["Demo workspace data"] : ["Workspace data"],
      },
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.message === "malformed_model_response"
        ? "malformed_model_response"
        : "provider_error";
    console.info(JSON.stringify({ event: "ai_request_failed", intent: intent.intent, reason }));
    if (reason === "malformed_model_response") {
      return fallbackStructuredResponse(
        intent.intent,
        dataMode,
        intent.timeRange,
        context.toolsUsed,
        "I could not complete that analysis from the current workspace data. Please try again."
      );
    }
    throw new ServerError("Pharmaflow AI is temporarily unavailable. Please try again.", "INTERNAL");
  }
}
