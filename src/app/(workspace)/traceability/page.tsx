import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { EmptyState } from "@/components/ds/empty-state";
import { TraceabilityWorkspace } from "@/components/traceability/TraceabilityWorkspace";
import { ServerError } from "@/lib/server/errors";
import { getTraceabilitySnapshot, resolveTraceabilityFilters } from "@/lib/server/traceability";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function TraceabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ lot?: string; batch?: string; order?: string; customer?: string; q?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getTraceabilitySnapshot(ctx, resolveTraceabilityFilters(params));
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <WorkspacePage>
        <PageHeader
          context="Operations"
          title="Traceability"
          description="Investigate material, batch and customer exposure."
        />
        <EmptyState title="Unable to load traceability" description="Refresh the page." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="Operations"
        title="Traceability"
        description="Investigate material, batch and customer exposure — forward and backward trace from recorded relationships only."
        metadata={data.disclaimer}
        relatedPath="/traceability"
      />
      <Suspense>
        <TraceabilityWorkspace data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
