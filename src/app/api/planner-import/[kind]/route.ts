import { NextResponse } from "next/server";

import type { PlannerCsvKind } from "@/lib/operations/planner-csv-parsers";
import { applyPlannerCsvImport, previewPlannerCsvImport } from "@/lib/server/planner-csv-import";
import { jsonApiError } from "@/lib/server/api-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

const KINDS: PlannerCsvKind[] = [
  "workstations",
  "orders",
  "customers",
  "shifts",
  "products",
  "materials",
  "routings",
  "personnel",
  "tools",
  "exceptions",
  "subassemblies",
];

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { kind: kindRaw } = await params;
    if (!KINDS.includes(kindRaw as PlannerCsvKind)) {
      return NextResponse.json({ message: "Unknown import kind." }, { status: 400 });
    }
    const kind = kindRaw as PlannerCsvKind;
    const body = (await request.json()) as { csv?: string; dryRun?: boolean };
    const csv = body.csv?.trim() ?? "";
    if (!csv) return NextResponse.json({ message: "CSV body is required." }, { status: 400 });

    if (body.dryRun) {
      const preview = await previewPlannerCsvImport(ctx, kind, csv);
      return NextResponse.json(preview);
    }

    const result = await applyPlannerCsvImport(ctx, kind, csv);
    return NextResponse.json({ ok: true, imported: result.imported });
  } catch (error) {
    return jsonApiError(error, "CSV import failed.");
  }
}
