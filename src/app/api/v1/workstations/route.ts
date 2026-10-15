import { NextResponse } from "next/server";

import { authenticateApiKey, requireApiScope } from "@/lib/server/api-key-auth";
import { jsonApiError } from "@/lib/server/api-route";
import { getPrisma } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    requireApiScope(auth, "production.read");
    const rows = await getPrisma().workstation.findMany({
      where: { tenantId: auth.tenantId, active: true },
      orderBy: { code: "asc" },
    });
    return NextResponse.json({
      workstations: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        kind: row.kind,
        capacityHoursPerDay: row.capacityHoursPerDay,
        departmentId: row.departmentId,
      })),
    });
  } catch (error) {
    return jsonApiError(error, "Unable to list workstations.");
  }
}
