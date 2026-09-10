import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";
import { listWorkflows } from "@/lib/server/workflows";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const data = await listWorkflows(ctx);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ message: "Unable to load workflows." }, { status: 503 });
  }
}
