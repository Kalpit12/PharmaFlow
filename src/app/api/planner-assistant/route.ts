import { NextResponse } from "next/server";

import { chatPlannerAssistant } from "@/lib/server/planner-assistant";
import { jsonApiError } from "@/lib/server/api-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as { message?: string };
    const message = body.message?.trim() ?? "";
    if (!message) {
      return NextResponse.json({ message: "message is required." }, { status: 400 });
    }
    const turn = await chatPlannerAssistant(ctx, message);
    return NextResponse.json({ turn });
  } catch (error) {
    return jsonApiError(error, "Planner assistant unavailable.");
  }
}
