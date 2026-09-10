import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { ScenarioWorkspace } from "@/components/scenarios/ScenarioWorkspace";
import { PageHeader } from "@/components/layout/PageHeader";
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
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 overflow-x-hidden px-4 py-5 sm:px-6">
        <PageHeader context="Intelligence" title="Scenarios" description="Test operational decisions before they affect the business." />
        <EmptyState title="Unable to load scenarios" description="Refresh the page and try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-5 overflow-x-hidden px-4 py-5 sm:px-6">
      <PageHeader
        context="Intelligence"
        title="Scenarios"
        description="Test operational decisions before they affect the business."
        relatedPath="/scenarios"
        metadata={`${data.disclaimer} · ${data.horizonLabel}`}
        badge={<StatusBadge tone="warning">Simulation only</StatusBadge>}
      />
      <Suspense>
        <ScenarioWorkspace data={data} />
      </Suspense>
    </div>
  );
}
