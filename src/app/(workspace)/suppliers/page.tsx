import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { SupplierWorkspace } from "@/components/suppliers/SupplierWorkspace";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";
import { getMaterialSupplierSnapshot, getSupplierDetail, getSupplierSnapshot, resolveSupplierFilters } from "@/lib/server/suppliers";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; q?: string; material?: string }>;
}) {
  const params = await searchParams;
  try {
    const ctx = await getAuthenticatedTenantContext();
    const filters = resolveSupplierFilters(params);
    const data = await getSupplierSnapshot(ctx, filters);
    const detailsEntries = await Promise.all(data.rows.map(async (row) => [row.supplierId, await getSupplierDetail(ctx, row.supplierId)] as const));
    const materialView = params.material ? await getMaterialSupplierSnapshot(ctx, params.material).catch(() => null) : null;

    return (
      <div className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-4 overflow-x-hidden px-4 py-5 sm:px-6">
        <PageHeader title="Suppliers" context="Procurement" description="Source coverage, preferred materials, and commercial visibility." metadata={data.disclaimer} relatedPath="/suppliers" />
        <SupplierWorkspace data={data} details={Object.fromEntries(detailsEntries)} materialView={materialView} />
      </div>
    );
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5 sm:px-6">
        <PageHeader title="Suppliers" context="Procurement" description="Source coverage, preferred materials, and commercial visibility." />
        <EmptyState title="Unable to load suppliers" description="Refresh the page." />
      </div>
    );
  }
}
