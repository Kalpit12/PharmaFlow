import { redirect } from "next/navigation";
import { Suspense } from "react";

import { OperationsPlanner } from "@/components/operations/OperationsPlanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { ServerError } from "@/lib/server/errors";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { getOperationsPlanner, resolvePlanningWindow } from "@/lib/server/operations";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; weeks?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    const materials = await getMaterialsSnapshot(ctx, resolveMaterialsFilters({})).catch(() => null);
    data = await getOperationsPlanner(ctx, resolvePlanningWindow(params), materials);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    console.error("Operations planner failed", error);
    return (
      <WorkspacePage width="full">
        <PageHeader
          context="Operations"
          title="Production Planning"
          description="Plan finite workstation capacity against priority, material availability and due dates."
        />
        <p className="text-sm text-muted-foreground">Unable to load the planner. Try again later.</p>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage width="full">
      <PageHeader
        context="Operations"
        title="Production Planning"
        description="Plan finite workstation capacity against priority, material availability and due dates."
        metadata={data.disclaimer}
        relatedPath="/operations"
        actions={
          <a
            href="/scenarios?capacity=-20"
            className="inline-flex min-h-11 items-center justify-center rounded-sm border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted sm:min-h-8"
          >
            Run scenario
          </a>
        }
      />
      <Suspense>
        <OperationsPlanner data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
