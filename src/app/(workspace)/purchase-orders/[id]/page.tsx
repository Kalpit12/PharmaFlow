import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ds/status-badge";
import { PoDetailWorkspace } from "@/components/purchase-orders/PoDetailWorkspace";
import { ServerError } from "@/lib/server/errors";
import { getPurchaseOrderDetail } from "@/lib/server/purchase-orders";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getPurchaseOrderDetail(ctx, id);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-6">
        <PageHeader title="Purchase order not found" description="This record does not exist in your workspace." />
        <EmptyState title="Not found" description="Return to Purchase Orders to browse records." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-5 overflow-x-hidden px-4 py-5 sm:px-6">
      <PageHeader
        title={data.poNumber}
        description={`${data.supplierName} · approval and receipt state.`}
        breadcrumbs={[
          { label: "Procurement", href: "/procurement" },
          { label: "Purchase Orders", href: "/purchase-orders" },
          { label: data.poNumber },
        ]}
        relatedPath="/purchase-orders"
        badge={<StatusBadge tone="info">Internal</StatusBadge>}
      />
      <Suspense>
        <PoDetailWorkspace data={data} />
      </Suspense>
    </div>
  );
}
