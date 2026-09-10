import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { ReportingWorkspace } from "@/components/reports/ReportingWorkspace";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { ServerError } from "@/lib/server/errors";
import { getReportingSnapshot, resolveReportFilters } from "@/lib/server/reports";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    warehouse?: string;
    category?: string;
    class?: string;
    q?: string;
    bucket?: string;
    supplier?: string;
    workstation?: string;
    status?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getReportingSnapshot(ctx, resolveReportFilters(params));
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    console.error("Reports failed to load", error);
    return (
      <WorkspacePage>
        <PageHeader
          context="Commercial"
          title="Reports"
          description="Answer the management question, then inspect the supporting records."
        />
        <EmptyState title="Unable to load reports" description="Refresh the page." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="Commercial"
        title="Reports"
        description="Answer the management question, then inspect the supporting records."
        metadata={data.disclaimer}
        relatedPath="/reports"
        actions={
          <a
            href="/command-center"
            className="inline-flex min-h-11 items-center justify-center rounded-sm border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted sm:min-h-8"
          >
            Command Center
          </a>
        }
      />
      <Suspense>
        <ReportingWorkspace data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
