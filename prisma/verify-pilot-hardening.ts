import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PrismaClient } from "@prisma/client";

import { getTraceabilitySnapshot } from "../src/lib/server/traceability";
import type { TenantContext } from "../src/lib/server/errors";
import { ServerError } from "../src/lib/server/errors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPilotHardeningVerify(prisma: PrismaClient) {
  const sources = [
    "src/lib/server/receiving.ts",
    "src/lib/server/communications.ts",
    "src/lib/server/traceability.ts",
    "src/lib/server/env.ts",
  ]
    .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
    .join("\n");

  assert(sources.includes("writeAuditLog"), "Receiving or communications records AuditLog");
  assert(sources.includes('requirePermission(ctx, "traceability.read")'), "Traceability snapshot enforces traceability.read");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const user = await prisma.user.findFirst({ where: { tenantId: tenant?.id } });
  assert(tenant && user, "Demo tenant required for pilot hardening verify");

  const procurement: TenantContext = { tenantId: tenant.id, userId: user.id, role: "PROCUREMENT" };
  try {
    await getTraceabilitySnapshot(procurement, {});
    throw new Error("PROCUREMENT role must not load traceability snapshot");
  } catch (error) {
    assert(error instanceof ServerError && error.code === "FORBIDDEN", "Traceability permission denied for PROCUREMENT");
  }

  console.log("Pilot hardening verification passed.");
}
