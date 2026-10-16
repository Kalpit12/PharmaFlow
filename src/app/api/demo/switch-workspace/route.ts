import { NextResponse } from "next/server";

import {
  DEMO_TENANT_SLUG_COOKIE,
  isSwitchableDemoTenantSlug,
} from "@/lib/demo-workspaces";
import { getAuthenticatedUser } from "@/lib/server/tenant-context";
import { getPrisma } from "@/lib/server/db";
import { ServerError } from "@/lib/server/errors";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const body = (await request.json().catch(() => ({}))) as { slug?: string };
    const slug = body.slug?.trim();
    if (!slug || !isSwitchableDemoTenantSlug(slug)) {
      return NextResponse.json({ message: "Unknown workspace." }, { status: 400 });
    }

    const prisma = getPrisma();
    const home = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { status: true } });
    const target = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (home?.status !== "DEMO" || target?.status !== "DEMO") {
      return NextResponse.json({ message: "Workspace switch is limited to demo tenants." }, { status: 403 });
    }

    const response = NextResponse.json({ ok: true, slug });
    response.cookies.set(DEMO_TENANT_SLUG_COOKIE, slug, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    }
    console.error("switch-workspace failed", error);
    return NextResponse.json({ message: "Unable to switch workspace." }, { status: 500 });
  }
}
