import { redirect } from "next/navigation";
import { Suspense } from "react";

import { RfqWorkspace } from "@/components/procurement-rfq/RfqWorkspace";
import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { canApprove } from "@/lib/server/actions";
import { ServerError } from "@/lib/server/errors";
import {
  getProcurementRfqFormOptions,
  getProcurementRfqListSnapshot,
  resolveProcurementRfqFilters,
} from "@/lib/server/procurement-rfqs";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function RfqsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  let data;
  let formOptions;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getProcurementRfqListSnapshot(ctx, resolveProcurementRfqFilters(params));
    formOptions = await getProcurementRfqFormOptions(ctx);
    void canApprove(ctx.role);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 overflow-x-hidden px-4 py-5 sm:px-6">
        <PageHeader
          context="Procurement"
          title="RFQs"
          description="Compare supplier responses before awarding procurement."
        />
        <EmptyState title="Unable to load RFQs" description="Refresh the page and try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-5 overflow-x-hidden px-4 py-5 sm:px-6">
      <PageHeader
        context="Procurement"
        title="RFQs"
        description="Compare supplier responses before awarding procurement."
        relatedPath="/rfqs"
        metadata={`${data.disclaimer} · ${data.generatedAt.slice(0, 10)}`}
      />
      <Suspense>
        <RfqWorkspace data={data} formOptions={formOptions} />
      </Suspense>
    </div>
  );
}
