import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { ScenarioWorkspace } from "@/components/scenarios/ScenarioWorkspace";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { StatusBadge } from "@/components/ds/status-badge";
import { getScenarioSnapshot, resolveScenarioInput } from "@/lib/server/scenarios";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function ScenariosPage({
  searchParams,
}: {
  searchParams: Promise<{
    horizon?: string;
    demand?: string;
    capacity?: string;
    delay?: string;
    inventory?: string;
    procurement?: string;
    priority?: string;
  }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getScenarioSnapshot(ctx, resolveScenarioInput(params));
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <WorkspacePage width="full">
        <PageHeader context="Planning" title="Planning & Simulation" description="Test operational decisions before changing the live plan." />
        <EmptyState title="Unable to load scenarios" description="Refresh the page and try again." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage width="full">
      <PageHeader
        context="Planning"
        title="Planning & Simulation"
        description="Test operational decisions before changing the live plan."
        relatedPath="/scenarios"
        metadata={`${data.brand} · ${data.horizonLabel} · ${data.statusLabel}`}
        badge={<StatusBadge tone="warning">Simulation only</StatusBadge>}
      />
      <Suspense>
        <ScenarioWorkspace data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
