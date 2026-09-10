import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { ProcurementWorkspace } from "@/components/procurement/ProcurementWorkspace";
import { ServerError } from "@/lib/server/errors";
import { canApprove } from "@/lib/server/actions";
import { getProcurementSnapshot, resolveProcurementFilters } from "@/lib/server/procurement";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; risk?: string; q?: string; material?: string; order?: string; requisition?: string }>;
}) {
  const params = await searchParams;
  let data;
  let canReview = false;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getProcurementSnapshot(ctx, resolveProcurementFilters(params));
    canReview = canApprove(ctx.role);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    console.error("Procurement failed to load", error);
    return (
      <WorkspacePage>
        <PageHeader
          context="Procurement"
          title="Procurement"
          description="Need to requisition, RFQ, award, purchase order and receiving — review before execution."
        />
        <EmptyState title="Unable to load procurement planning" description="Refresh the page." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="Procurement"
        title="Procurement"
        description="Need to requisition, RFQ, award, purchase order and receiving — review before execution."
        relatedPath="/procurement"
        metadata={data.disclaimer}
        actions={
          <a
            href="/scenarios?procurement=-20"
            className="inline-flex min-h-11 items-center justify-center rounded-sm border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted sm:min-h-8"
          >
            Simulate supply constraint
          </a>
        }
      />
      <Suspense>
        <ProcurementWorkspace data={data} canReview={canReview} initialRequisitionId={params.requisition} />
      </Suspense>
    </WorkspacePage>
  );
}
