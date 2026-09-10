import type { ActionProposal } from "@/lib/ai/actions";
import type { CommunicationDraftView } from "@/lib/ai/communications";
import type { WorkflowProposal } from "@/lib/ai/workflows";
import type { AIIntentName } from "@/lib/ai/intents";
import type { AIToolName } from "@/lib/ai/tools";
import type { DataMode, TimeRange } from "@/lib/ai/types";

export type InsightCategory =
  | "DEMAND_SIGNAL"
  | "SALES_SIGNAL"
  | "CUSTOMER_SIGNAL"
  | "REGIONAL_SIGNAL"
  | "RFQ_SIGNAL"
  | "OPPORTUNITY"
  | "RISK"
  | "ATTENTION";

export type InsightSeverity = "info" | "watch" | "high";

export type AIInsightContract = {
  category: InsightCategory;
  title: string;
  description?: string;
  metric?: string;
  trend?: string;
  severity?: InsightSeverity;
  entity?: string;
  recommendedAction?: string;
};

export type AIActionKind =
  | "VIEW_PRODUCT"
  | "VIEW_CUSTOMER"
  | "VIEW_REGION"
  | "VIEW_RFQ"
  | "VIEW_SALES"
  | "REVIEW_ATTENTION"
  | "INVESTIGATE_OPPORTUNITY";

export type AIActionContract = {
  kind: AIActionKind;
  label: string;
  /** Placeholder module route until domain pages exist. */
  href: string;
  entityId?: string;
};

export type AIFollowUp = {
  question: string;
  intent?: AIIntentName;
};

export type AIResponseMetadata = {
  intent: AIIntentName;
  dataMode: DataMode;
  timeRange: TimeRange;
  toolsUsed: AIToolName[];
  /** Human-readable source labels, e.g. "Demonstration dashboard · RFQs". */
  sources: string[];
};

/**
 * Structured response the UI should eventually render.
 * Providers must return this shape — not free-form markdown.
 */
export type StructuredAIResponse = {
  summary: string;
  keySignals: string[];
  recommendedActions: string[];
  followUps: AIFollowUp[];
  insights: AIInsightContract[];
  actions: AIActionContract[];
  metadata: AIResponseMetadata;
  actionProposal?: ActionProposal;
  workflowProposal?: WorkflowProposal;
  communicationDraft?: CommunicationDraftView;
  proposedActionDraft?: { type: string; title: string; reason: string; targetName: string };
  proposedWorkflowDraft?: { type: string; title: string; reason: string; targetName: string };
  proposedCommunicationDraft?: import("@/lib/ai/communications").ModelCommunicationDraft;
};
