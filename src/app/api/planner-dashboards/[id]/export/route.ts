import { NextResponse } from "next/server";

import { buildPlannerDashboardCsv, buildPlannerDashboardPrintHtml } from "@/lib/operations/planner-dashboard-export";
import { exportPlannerDashboardSnapshot } from "@/lib/server/planner-dashboards";
import { jsonApiError } from "@/lib/server/api-route";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const { id } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "csv";
    const { snapshot, title } = await exportPlannerDashboardSnapshot(ctx, id);
    const safeName = title.replace(/[^\w\-]+/g, "-").slice(0, 48);

    if (format === "html" || format === "pdf") {
      const html = buildPlannerDashboardPrintHtml(snapshot, title);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeName}-dashboard.html"`,
        },
      });
    }

    const csv = buildPlannerDashboardCsv(snapshot);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}-dashboard.csv"`,
      },
    });
  } catch (error) {
    return jsonApiError(error, "Unable to export dashboard.");
  }
}
