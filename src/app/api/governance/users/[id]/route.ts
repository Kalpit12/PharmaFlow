import { NextResponse } from "next/server";

import { ServerError, publicErrorMessage } from "@/lib/server/errors";
import { updateUserRole } from "@/lib/server/governance";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await context.params;
    const body = (await request.json()) as { role?: string };
    if (!body.role) throw new ServerError("Role is required.", "INTERNAL");
    const result = await updateUserRole(ctx, id, body.role);
    return NextResponse.json(result);
  } catch (error) {
    const { code, message } = publicErrorMessage(error);
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ code, message }, { status });
  }
}
