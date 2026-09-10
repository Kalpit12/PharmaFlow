import { NextResponse } from "next/server";

import type { ConversationTurn } from "@/lib/ai/provider";
import { runProductionOrchestrator } from "@/lib/server/ai-orchestrator";
import { allowAiRequest } from "@/lib/server/ai-rate-limit";
import { ServerError, publicErrorMessage } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

const MAX_QUESTION = 2000;
const MAX_HISTORY = 6;

function parseHistory(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: ConversationTurn[] = [];
  for (const item of value.slice(-MAX_HISTORY)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (typeof row.content !== "string") continue;
    turns.push({ role: row.role, content: row.content.slice(0, 400) });
  }
  return turns;
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    if (!allowAiRequest(ctx.userId ?? ctx.tenantId)) {
      return NextResponse.json({ message: "Too many requests. Please wait and try again." }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    }

    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const question = typeof record?.question === "string" ? record.question.trim() : "";
    if (!question) return NextResponse.json({ message: "Enter a question." }, { status: 400 });
    if (question.length > MAX_QUESTION) {
      return NextResponse.json({ message: "Question is too long." }, { status: 400 });
    }

    const response = await runProductionOrchestrator({
      ctx,
      question,
      history: parseHistory(record?.conversation),
    });
    return NextResponse.json({ response });
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    const safe = publicErrorMessage(error);
    const message =
      error instanceof ServerError && error.message.startsWith("Pharmaflow AI")
        ? error.message
        : "Pharmaflow AI is temporarily unavailable. Please try again.";
    return NextResponse.json({ message, code: safe.code }, { status: 503 });
  }
}
