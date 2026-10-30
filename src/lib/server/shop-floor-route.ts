import { NextResponse } from "next/server";

import { ServerError } from "@/lib/server/errors";

/** Shared error → HTTP mapping for shop-floor routes. 409 tells the offline queue "already applied". */
export function shopFloorErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ServerError) {
    const status =
      error.code === "UNAUTHORIZED"
        ? 401
        : error.code === "FORBIDDEN"
          ? 403
          : error.code === "NOT_FOUND"
            ? 404
            : error.code === "CONFLICT"
              ? 409
              : 400;
    const message = error.code === "UNAUTHORIZED" ? "Authentication required." : error.message;
    return NextResponse.json({ message }, { status });
  }
  console.error(fallback, error);
  return NextResponse.json({ message: fallback }, { status: 503 });
}
