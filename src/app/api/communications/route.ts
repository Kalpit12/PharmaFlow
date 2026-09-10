import { NextResponse } from "next/server";

import { parseModelCommunication } from "@/lib/ai/communications";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";
import { listCommunications, proposeCommunication } from "@/lib/server/communications";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const data = await listCommunications(ctx);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ message: "Unable to load communications." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    }
    const draft = parseModelCommunication(body);
    if (!draft) return NextResponse.json({ message: "Unsupported or incomplete communication draft." }, { status: 400 });
    const result = await proposeCommunication(ctx, draft);
    if (result.status === "skipped") {
      return NextResponse.json({ message: "Unsupported communication type." }, { status: 400 });
    }
    if (result.status === "clarification") {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    return NextResponse.json({ draft: result.draft });
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ message: "Unable to save the draft." }, { status: 503 });
  }
}
