import { NextResponse } from "next/server";

import { proposeGanttOperationMove, proposeGanttOrderMove } from "@/lib/server/aps-plan";
import { jsonApiError } from "@/lib/server/api-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as {
      orderId?: string;
      operationId?: string;
      workstationId?: string;
      proposedStart?: string;
    };
    if (!body.workstationId || !body.proposedStart) {
      return NextResponse.json({ message: "workstationId and proposedStart are required." }, { status: 400 });
    }
    if (!body.operationId && !body.orderId) {
      return NextResponse.json({ message: "orderId or operationId is required." }, { status: 400 });
    }
    const proposal = body.operationId
      ? await proposeGanttOperationMove(ctx, {
          operationId: body.operationId,
          workstationId: body.workstationId,
          proposedStart: body.proposedStart,
        })
      : await proposeGanttOrderMove(ctx, {
          orderId: body.orderId!,
          workstationId: body.workstationId,
          proposedStart: body.proposedStart,
        });
    return NextResponse.json({ proposal });
  } catch (error) {
    return jsonApiError(error, "Unable to propose Gantt move.");
  }
}
