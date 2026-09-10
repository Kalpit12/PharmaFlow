import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReceivingDetailWorkspace } from "@/components/receiving/ReceivingDetailWorkspace";
import { ServerError } from "@/lib/server/errors";
import { getReceivingDetail } from "@/lib/server/receiving";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function ReceivingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getReceivingDetail(ctx, id);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-6">
        <PageHeader title="Receive goods" description="Purchase order receiving." />
        <EmptyState title="Unable to load receiving" description="Refresh and try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-5 overflow-x-hidden px-4 py-5 sm:px-6">
      <PageHeader
        title={data.poNumber}
        description={`${data.supplierName} · receive into inventory.`}
        breadcrumbs={[
          { label: "Procurement", href: "/procurement" },
          { label: "Receiving", href: "/receiving" },
          { label: data.poNumber },
        ]}
        relatedPath="/receiving"
      />
      <ReceivingDetailWorkspace data={data} />
    </div>
  );
}
