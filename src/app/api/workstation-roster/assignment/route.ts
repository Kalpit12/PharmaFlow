import { NextResponse } from "next/server";

import { jsonApiError } from "@/lib/server/api-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";
import { deleteRosterAssignment, upsertRosterAssignment } from "@/lib/server/workstation-roster";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as {
      workstationId?: string;
      date?: string;
      startMinute?: number;
      endMinute?: number;
      employeeId?: string | null;
      shiftLabel?: string | null;
    };
    if (!body.workstationId || !body.date || body.startMinute == null || body.endMinute == null) {
      return NextResponse.json({ message: "workstationId, date, startMinute, and endMinute are required." }, { status: 400 });
    }
    const result = await upsertRosterAssignment(ctx, {
      workstationId: body.workstationId,
      date: body.date,
      startMinute: body.startMinute,
      endMinute: body.endMinute,
      employeeId: body.employeeId,
      shiftLabel: body.shiftLabel,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonApiError(error, "Unable to save roster shift.");
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as {
      id?: string;
      workstationId?: string;
      date?: string;
      startMinute?: number;
      endMinute?: number;
      employeeId?: string | null;
      shiftLabel?: string | null;
    };
    if (!body.workstationId || !body.date || body.startMinute == null || body.endMinute == null) {
      return NextResponse.json({ message: "workstationId, date, startMinute, and endMinute are required." }, { status: 400 });
    }
    const result = await upsertRosterAssignment(ctx, {
      id: body.id,
      workstationId: body.workstationId,
      date: body.date,
      startMinute: body.startMinute,
      endMinute: body.endMinute,
      employeeId: body.employeeId,
      shiftLabel: body.shiftLabel,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonApiError(error, "Unable to update roster shift.");
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as { id?: string };
    if (!body.id || body.id.startsWith("tpl:")) {
      return NextResponse.json({ message: "A saved assignment id is required." }, { status: 400 });
    }
    await deleteRosterAssignment(ctx, body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonApiError(error, "Unable to delete roster shift.");
  }
}
