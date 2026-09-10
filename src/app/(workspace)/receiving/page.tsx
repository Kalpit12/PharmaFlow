import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReceivingWorkspace } from "@/components/receiving/ReceivingWorkspace";
import { ServerError } from "@/lib/server/errors";
import { getReceivingListSnapshot, resolveReceivingFilters } from "@/lib/server/receiving";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function ReceivingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getReceivingListSnapshot(ctx, resolveReceivingFilters(params));
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-6">
        <PageHeader context="Procurement" title="Receiving" description="Close open POs into inventory lots." />
        <EmptyState title="Unable to load receiving" description="Refresh and try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-5 overflow-x-hidden px-4 py-5 sm:px-6">
      <PageHeader
        context="Procurement"
        title="Receiving"
        description="Close open POs into inventory lots."
        relatedPath="/receiving"
        metadata={`${data.disclaimer} · ${data.generatedAt.slice(0, 10)}`}
      />
      <Suspense>
        <ReceivingWorkspace data={data} />
      </Suspense>
    </div>
  );
}
