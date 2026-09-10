import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { RfqDetailWorkspace } from "@/components/procurement-rfq/RfqDetailWorkspace";
import { StatusBadge } from "@/components/ds/status-badge";
import { ServerError } from "@/lib/server/errors";
import { getProcurementRfqDetail } from "@/lib/server/procurement-rfqs";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getProcurementRfqDetail(ctx, id);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    if (error instanceof ServerError && error.code === "NOT_FOUND") {
      return (
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-6">
          <PageHeader title="RFQ not found" description="This procurement RFQ does not exist in your workspace." />
          <EmptyState title="Not found" description="Return to RFQ Management to browse active requests." />
        </div>
      );
    }
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-6">
        <PageHeader title="RFQ Management" description="Unable to load this RFQ." />
        <EmptyState title="Unable to load RFQ" description="Refresh the page and try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-5 overflow-x-hidden px-4 py-5 sm:px-6">
      <PageHeader
        title={data.reference}
        description="Items, supplier responses, and award decision."
        breadcrumbs={[
          { label: "Procurement", href: "/procurement" },
          { label: "RFQs", href: "/rfqs" },
          { label: data.reference },
        ]}
        relatedPath="/rfqs"
        badge={<StatusBadge tone="info">Internal</StatusBadge>}
      />
      <Suspense>
        <RfqDetailWorkspace data={data} />
      </Suspense>
    </div>
  );
}
