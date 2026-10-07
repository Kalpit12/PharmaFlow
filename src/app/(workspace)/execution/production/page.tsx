import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ProductionExecutionWorkspace } from "@/components/execution/ProductionExecutionWorkspace";
import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { ServerError } from "@/lib/server/errors";
import {
  getProductionExecutionSnapshot,
  resolveProductionExecutionFilters,
} from "@/lib/server/production-execution";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function ProductionExecutionPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; order?: string; q?: string; workstation?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getProductionExecutionSnapshot(ctx, resolveProductionExecutionFilters(params));
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    if (error instanceof ServerError && error.code === "FORBIDDEN") {
      return (
        <WorkspacePage>
          <PageHeader
            context="Operations"
            title="Production Execution"
            description="Shop-floor control for release, start, pause, resume, and complete."
          />
          <EmptyState title="Access restricted" description="You do not have permission to view production execution." />
        </WorkspacePage>
      );
    }
    return (
      <WorkspacePage>
        <PageHeader
          context="Operations"
          title="Production Execution"
          description="Shop-floor control for release, start, pause, resume, and complete."
        />
        <EmptyState title="Unable to load production execution" description="Refresh the page." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="Operations"
        title="Production Execution"
        description="Move scheduled work from release through completion — planned vs actual, risk, and execution history."
        metadata={data.disclaimer}
        relatedPath="/execution/production"
      />
      <Suspense>
        <ProductionExecutionWorkspace data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
