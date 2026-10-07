import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { acceptSchedulePlan } from "@/lib/server/aps-plan";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    const proposal = await acceptSchedulePlan(ctx, id);
    return NextResponse.json({ proposal });
  } catch (error) {
    return jsonApiError(error, "Unable to accept the proposed schedule.");
  }
}
