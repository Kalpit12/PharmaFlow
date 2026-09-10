import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/server/db";
import { publicErrorMessage } from "@/lib/server/errors";

export async function GET() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const body = publicErrorMessage(error);
    return NextResponse.json({ ok: false, message: body.message }, { status: 503 });
  }
}
