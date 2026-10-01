import { NextResponse } from "next/server";

import { explainOperationalIntelligence } from "@/lib/ai/intelligence-explain";
import { allowAiRequest } from "@/lib/server/ai-rate-limit";
import { ServerError, publicErrorMessage } from "@/lib/server/errors";
import { getIntelligenceSnapshot, toCompactIntelligenceContext } from "@/lib/server/intelligence";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    if (!allowAiRequest(`intel:${ctx.userId ?? ctx.tenantId}`)) {
      return NextResponse.json({ message: "Too many requests. Please wait and try again." }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    }
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const question =
      typeof record?.question === "string" && record.question.trim()
        ? record.question.trim().slice(0, 400)
        : "What should management look at?";
    const priorityId = typeof record?.priorityId === "string" ? record.priorityId : undefined;

    const snapshot = await getIntelligenceSnapshot(ctx);
    const context = toCompactIntelligenceContext(snapshot, question, priorityId);
    const explanation = await explainOperationalIntelligence({ snapshot, context });
    return NextResponse.json({ explanation, openaiCalls: explanation.source === "openai" ? 1 : 0 });
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ServerError && error.code === "FORBIDDEN") {
      return NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 });
    }
    const safe = publicErrorMessage(error);
    return NextResponse.json({ message: "Intelligence explanation unavailable.", code: safe.code }, { status: 503 });
  }
}
