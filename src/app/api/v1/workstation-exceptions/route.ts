import { NextResponse } from "next/server";

import { authenticateApiKey, requireApiScope, tenantContextFromApiKey } from "@/lib/server/api-key-auth";
import { jsonApiError } from "@/lib/server/api-route";
import { getPrisma } from "@/lib/server/db";
import { ServerError } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    requireApiScope(auth, "production.write");
    const ctx = tenantContextFromApiKey(auth);
    const body = (await request.json()) as {
      workstationCode?: string;
      date?: string;
      reason?: string;
      closed?: boolean;
    };
    if (!body.workstationCode || !body.date || !body.reason?.trim()) {
      return NextResponse.json({ message: "workstationCode, date, and reason are required." }, { status: 400 });
    }
    const ws = await getPrisma().workstation.findFirst({
      where: { tenantId: ctx.tenantId, code: body.workstationCode },
      select: { id: true },
    });
    if (!ws) throw new ServerError("Workstation not found.", "NOT_FOUND");
    const date = new Date(`${body.date}T00:00:00.000Z`);
    const row = await getPrisma().workstationCalendarException.create({
      data: {
        tenantId: ctx.tenantId,
        workstationId: ws.id,
        date,
        reason: body.reason.trim(),
        closed: body.closed ?? true,
      },
    });
    return NextResponse.json({ id: row.id });
  } catch (error) {
    return jsonApiError(error, "Unable to create workstation exception.");
  }
}
