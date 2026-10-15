import { NextResponse } from "next/server";

import { acceptPlannerAssistantDraft, rejectPlannerAssistantDraft } from "@/lib/server/planner-assistant";
import { jsonApiError } from "@/lib/server/api-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    const body = (await request.json()) as { decision?: "accept" | "reject" };
    if (body.decision === "reject") {
      const result = await rejectPlannerAssistantDraft(ctx, id);
      return NextResponse.json(result);
    }
    const result = await acceptPlannerAssistantDraft(ctx, id);
    return NextResponse.json(result);
  } catch (error) {
    return jsonApiError(error, "Unable to update draft.");
  }
}
