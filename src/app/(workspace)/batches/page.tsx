import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BatchesWorkspace } from "@/components/batches/BatchesWorkspace";
import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { getBatchesSnapshot, resolveBatchesFilters } from "@/lib/server/batches";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; batch?: string; q?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getBatchesSnapshot(ctx, resolveBatchesFilters(params));
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <WorkspacePage>
        <PageHeader
          context="Operations"
          title="Batches"
          description="Production batch identity, material context, and controlled quality decisions."
        />
        <EmptyState title="Unable to load batches" description="Refresh the page." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="Operations"
        title="Batches"
        description="Production batch identity, material context, and controlled quality decisions — manufacturing status separate from quality status."
        metadata={data.disclaimer}
        relatedPath="/batches"
      />
      <Suspense>
        <BatchesWorkspace data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
