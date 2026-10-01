import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { MaterialsWorkspace } from "@/components/materials/MaterialsWorkspace";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { ServerError } from "@/lib/server/errors";
import { getMaterialsSnapshot, resolveMaterialsFilters } from "@/lib/server/materials";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; risk?: string; order?: string; q?: string; material?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getMaterialsSnapshot(ctx, resolveMaterialsFilters(params));
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    console.error("Materials failed to load", error);
    return (
      <WorkspacePage>
        <PageHeader
          context="Operations"
          title="Materials"
          description="From material availability to production impact — shortages, timing, and procurement linkage."
        />
        <EmptyState title="Unable to load material requirements" description="Refresh the page." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="Operations"
        title="Materials"
        description="From material availability to production impact — shortages, timing, and procurement linkage."
        metadata={data.disclaimer}
        relatedPath="/materials"
        actions={
          <a
            href="/scenarios?inventory=-20"
            className="inline-flex min-h-11 items-center justify-center rounded-sm border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted sm:min-h-8"
          >
            Simulate material pressure
          </a>
        }
      />
      <Suspense>
        <MaterialsWorkspace data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
