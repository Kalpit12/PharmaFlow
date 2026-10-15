import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/auth/authorization";
import { parseWorkstationCsv } from "@/lib/operations/workstation-csv";
import { writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    requirePermission(ctx, "production.schedule");

    const body = (await request.json()) as { csv?: string; dryRun?: boolean };
    const csv = body.csv?.trim() ?? "";
    if (!csv) {
      return NextResponse.json({ message: "CSV body is required." }, { status: 400 });
    }

    const { rows, issues } = parseWorkstationCsv(csv);
    if (issues.length > 0) {
      return NextResponse.json({ ok: false, issues, imported: 0 }, { status: 422 });
    }

    const prisma = getPrisma();
    const [sites, groups] = await Promise.all([
      prisma.plantSite.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, code: true } }),
      prisma.workstationGroup.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, code: true } }),
    ]);
    const siteByCode = new Map(sites.map((row) => [row.code.toUpperCase(), row.id]));
    const groupByCode = new Map(groups.map((row) => [row.code.toUpperCase(), row.id]));

    const preview = rows.map((row) => {
      const siteId = row.siteCode ? siteByCode.get(row.siteCode.toUpperCase()) ?? null : null;
      const groupId = row.groupCode ? groupByCode.get(row.groupCode.toUpperCase()) ?? null : null;
      return {
        ...row,
        siteResolved: Boolean(siteId),
        groupResolved: Boolean(groupId),
      };
    });

    const unresolved = preview.filter((row) => (row.siteCode && !row.siteResolved) || (row.groupCode && !row.groupResolved));
    if (unresolved.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Unknown siteCode or groupCode in CSV.",
          unresolved: unresolved.map((row) => row.code),
        },
        { status: 422 }
      );
    }

    if (body.dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, rows: preview.length, preview: preview.map((row) => row.code) });
    }

    let imported = 0;
    for (const row of rows) {
      const siteId = row.siteCode ? siteByCode.get(row.siteCode.toUpperCase()) ?? null : null;
      const groupId = row.groupCode ? groupByCode.get(row.groupCode.toUpperCase()) ?? null : null;
      await prisma.workstation.upsert({
        where: { tenantId_code: { tenantId: ctx.tenantId, code: row.code } },
        create: {
          tenantId: ctx.tenantId,
          code: row.code,
          name: row.name,
          kind: row.kind,
          capacityHoursPerDay: row.capacityHoursPerDay,
          active: row.active,
          siteId,
          groupId,
        },
        update: {
          name: row.name,
          kind: row.kind,
          capacityHoursPerDay: row.capacityHoursPerDay,
          active: row.active,
          siteId,
          groupId,
        },
      });
      imported += 1;
    }

    await writeAuditLog(ctx, {
      action: "PLANT_MODEL_WORKSTATION_CSV_IMPORT",
      entityType: "Workstation",
      newValue: `Imported ${imported} workstation row(s) from CSV.`,
      reason: "Phase 1 plant model onboarding",
    });

    return NextResponse.json({ ok: true, imported });
  } catch (error) {
    if (error instanceof ServerError) {
      return NextResponse.json({ message: error.message }, { status: error.code === "UNAUTHORIZED" ? 401 : 403 });
    }
    console.error("Workstation CSV import failed", error);
    return NextResponse.json({ message: "Import failed." }, { status: 500 });
  }
}
