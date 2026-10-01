import { NextResponse } from "next/server";

import { explainScenario } from "@/lib/ai/scenario-explain";
import { allowAiRequest } from "@/lib/server/ai-rate-limit";
import { ServerError, publicErrorMessage } from "@/lib/server/errors";
import { getScenarioSnapshot, resolveScenarioInput, toCompactScenarioContext } from "@/lib/server/scenarios";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    if (!allowAiRequest(`scenario:${ctx.userId ?? ctx.tenantId}`)) {
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
        : "Explain this scenario.";
    const params =
      record?.params && typeof record.params === "object" ? (record.params as Record<string, string | undefined>) : {};

    const snapshot = await getScenarioSnapshot(ctx, resolveScenarioInput(params));
    const context = toCompactScenarioContext(snapshot);
    const explanation = await explainScenario({ context, decision: snapshot.decision, question });
    return NextResponse.json({ explanation, openaiCalls: explanation.source === "openai" ? 1 : 0 });
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ServerError && error.code === "FORBIDDEN") {
      return NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 });
    }
    const safe = publicErrorMessage(error);
    return NextResponse.json({ message: "Scenario explanation unavailable.", code: safe.code }, { status: 503 });
  }
}
