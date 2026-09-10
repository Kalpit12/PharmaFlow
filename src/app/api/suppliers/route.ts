import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";
import { getSupplierSnapshot, resolveSupplierFilters } from "@/lib/server/suppliers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const url = new URL(request.url);
    const data = await getSupplierSnapshot(
      ctx,
      resolveSupplierFilters({
        view: url.searchParams.get("view") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        q: url.searchParams.get("q") ?? undefined,
        material: url.searchParams.get("material") ?? undefined,
      })
    );
    return NextResponse.json({ suppliers: data });
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ message: "Unable to load suppliers." }, { status: 503 });
  }
}
