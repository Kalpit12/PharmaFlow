import type { BusinessContext } from "@/lib/ai/context";
import type { StructuredAIResponse } from "@/lib/ai/response";

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type GenerateResponseInput = {
  question: string;
  context: BusinessContext;
  history?: ConversationTurn[];
};

/**
 * Replaceable model boundary. The AI Assistant UI must not import a vendor SDK.
 * No provider is configured in Phase 5B.
 */
export type AIProvider = {
  id: "openai" | "gemini" | "anthropic" | "local" | "none";
  generateResponse(input: GenerateResponseInput): Promise<StructuredAIResponse>;
};

export const TRUST_RULES = [
  "Never invent business figures, customers, products, or orders.",
  "Never claim an action was completed when it was not.",
  "Distinguish demonstration data from live commercial data.",
  "If required data is missing, say so — do not guess.",
  "No pharmaceutical or medical advice; no unsupported clinical claims.",
  "Do not expose business information the user is not authorized to see.",
] as const;
