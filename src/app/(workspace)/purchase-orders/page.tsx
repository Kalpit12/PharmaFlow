import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { PoWorkspace } from "@/components/purchase-orders/PoWorkspace";
import { ServerError } from "@/lib/server/errors";
import { getPurchaseOrderListSnapshot, resolvePurchaseOrderFilters } from "@/lib/server/purchase-orders";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getPurchaseOrderListSnapshot(ctx, resolvePurchaseOrderFilters(params));
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-6">
        <PageHeader context="Procurement" title="Purchase Orders" description="Approval-controlled purchasing from awarded RFQs." />
        <EmptyState title="Unable to load purchase orders" description="Refresh and try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-5 overflow-x-hidden px-4 py-5 sm:px-6">
      <PageHeader
        context="Procurement"
        title="Purchase Orders"
        description="Approval-controlled purchasing from awarded RFQs."
        relatedPath="/purchase-orders"
        metadata={`${data.disclaimer} · ${data.generatedAt.slice(0, 10)}`}
      />
      <Suspense>
        <PoWorkspace data={data} />
      </Suspense>
    </div>
  );
}
