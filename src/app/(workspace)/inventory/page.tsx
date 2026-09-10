import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { InventoryWorkspace } from "@/components/inventory/InventoryWorkspace";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { ServerError } from "@/lib/server/errors";
import { getInventorySnapshot, resolveInventoryFilters } from "@/lib/server/inventory";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; class?: string; status?: string; q?: string; bucket?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getInventorySnapshot(ctx, resolveInventoryFilters(params));
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    console.error("Inventory failed to load", error);
    return (
      <WorkspacePage>
        <PageHeader
          context="Operations"
          title="Inventory"
          description="Stock state, expiry, ageing and lot risk for the current workspace."
        />
        <EmptyState title="Unable to load inventory" description="Refresh the page." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="Operations"
        title="Inventory"
        description="Stock state, expiry, ageing and lot risk for the current workspace."
        metadata={data.disclaimer}
        relatedPath="/inventory"
      />
      <Suspense>
        <InventoryWorkspace data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
