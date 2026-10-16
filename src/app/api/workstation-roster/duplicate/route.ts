import { NextResponse } from "next/server";

import { duplicateRosterAssignment } from "@/lib/server/workstation-roster";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";
import { jsonApiError } from "@/lib/server/api-route";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as { assignmentId?: string; targetDate?: string };
    if (!body.assignmentId || !body.targetDate) {
      return NextResponse.json({ message: "assignmentId and targetDate are required." }, { status: 400 });
    }
    const result = await duplicateRosterAssignment(ctx, body.assignmentId, body.targetDate);
    return NextResponse.json(result);
  } catch (error) {
    return jsonApiError(error, "Unable to duplicate roster shift.");
  }
}
