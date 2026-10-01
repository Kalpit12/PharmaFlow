import { NextResponse } from "next/server";

import { createQualityException } from "@/lib/server/quality";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const body = (await request.json()) as Parameters<typeof createQualityException>[1];
    const result = await createQualityException(ctx, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ServerError && error.code === "NOT_FOUND") {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    if (error instanceof ServerError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: "Unable to create quality exception." }, { status: 503 });
  }
}
