import { NextResponse } from "next/server";

import type { ProcurementRfqStatus } from "@/lib/procurement-rfq/types";
import { PROCUREMENT_RFQ_STATUSES } from "@/lib/procurement-rfq/types";
import { ServerError } from "@/lib/server/errors";
import { updateProcurementRfqStatus } from "@/lib/server/procurement-rfqs";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    }
    const status = (body as { status?: string }).status;
    if (!status || !PROCUREMENT_RFQ_STATUSES.includes(status as ProcurementRfqStatus)) {
      return NextResponse.json({ message: "Invalid status." }, { status: 400 });
    }
    const rfq = await updateProcurementRfqStatus(ctx, id, status as ProcurementRfqStatus);
    return NextResponse.json({ rfq });
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ServerError && error.code === "FORBIDDEN") {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    if (error instanceof ServerError && error.code === "NOT_FOUND") {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: "Unable to update RFQ." }, { status: 503 });
  }
}
