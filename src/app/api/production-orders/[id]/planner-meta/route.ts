import { NextResponse } from "next/server";

import { can } from "@/lib/auth/authorization";
import { jsonApiError } from "@/lib/server/api-route";
import { getPrisma } from "@/lib/server/db";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    if (!can(ctx.role, "production.schedule")) {
      throw new ServerError("Not allowed to update planner fields.", "FORBIDDEN");
    }
    const { id } = await params;
    const body = (await request.json()) as {
      isLocked?: boolean;
      priority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
    };
    if (body.isLocked === undefined && body.priority === undefined) {
      return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
    }
    const prisma = getPrisma();
    const order = await prisma.productionOrder.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!order) return NextResponse.json({ message: "Order not found." }, { status: 404 });

    const updated = await prisma.productionOrder.update({
      where: { id: order.id },
      data: {
        ...(body.isLocked !== undefined ? { isLocked: body.isLocked } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
      },
      select: { id: true, orderNumber: true, isLocked: true, priority: true },
    });
    return NextResponse.json({ order: updated });
  } catch (error) {
    return jsonApiError(error, "Unable to update order planner fields.");
  }
}
