import { NextResponse } from "next/server";

import { LAB_ALLIED_DEMO_SLUG } from "@/lib/demo-tenant";
import { getPrisma } from "@/lib/server/db";
import { runLabAlliedDemoCatchup } from "@/lib/server/lab-allied-demo-heartbeat";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { slug: LAB_ALLIED_DEMO_SLUG } });
  if (!tenant || tenant.status !== "DEMO") {
    return NextResponse.json({ skipped: true, reason: "Demo tenant not found" });
  }

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, status: "ACTIVE" },
    select: { id: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: "No active demo user" }, { status: 500 });
  }

  const ctx = { tenantId: tenant.id, userId: user.id, role: user.role };
  const ticks = await runLabAlliedDemoCatchup(prisma, ctx);

  return NextResponse.json({ ok: true, ticks, tenantId: tenant.id });
}
