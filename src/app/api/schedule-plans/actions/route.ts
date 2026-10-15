import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import {
  proposeRescheduleUnscheduled,
  proposeRescheduleWorkstation,
  proposeWithBulldozer,
  setOrderFastTrackAndPropose,
  unscheduleAllOpenOrders,
  unscheduleProductionOrder,
} from "@/lib/server/aps-plan";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

type ScheduleAction =
  | "BULLDOZER"
  | "UNSCHEDULED_ONLY"
  | "WORKSTATION"
  | "FAST_TRACK"
  | "UNSCHEDULE_ORDER"
  | "UNSCHEDULE_ALL";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as {
      action?: ScheduleAction;
      workstationId?: string;
      orderId?: string;
      windowStart?: string;
    };
    const action = body.action;
    if (!action) return NextResponse.json({ message: "action is required." }, { status: 400 });

    if (action === "BULLDOZER") {
      const proposal = await proposeWithBulldozer(ctx, body.windowStart);
      return NextResponse.json({ proposal });
    }
    if (action === "UNSCHEDULED_ONLY") {
      const proposal = await proposeRescheduleUnscheduled(ctx, body.windowStart);
      return NextResponse.json({ proposal });
    }
    if (action === "WORKSTATION") {
      if (!body.workstationId) return NextResponse.json({ message: "workstationId is required." }, { status: 400 });
      const proposal = await proposeRescheduleWorkstation(ctx, body.workstationId, body.windowStart);
      return NextResponse.json({ proposal });
    }
    if (action === "FAST_TRACK") {
      if (!body.orderId) return NextResponse.json({ message: "orderId is required." }, { status: 400 });
      const proposal = await setOrderFastTrackAndPropose(ctx, body.orderId, body.windowStart);
      return NextResponse.json({ proposal });
    }
    if (action === "UNSCHEDULE_ORDER") {
      if (!body.orderId) return NextResponse.json({ message: "orderId is required." }, { status: 400 });
      const result = await unscheduleProductionOrder(ctx, body.orderId);
      return NextResponse.json(result);
    }
    if (action === "UNSCHEDULE_ALL") {
      const result = await unscheduleAllOpenOrders(ctx);
      return NextResponse.json(result);
    }

    return NextResponse.json({ message: "Unknown action." }, { status: 400 });
  } catch (error) {
    return jsonApiError(error, "Schedule action failed.");
  }
}
