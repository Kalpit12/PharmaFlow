import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { SupplierPerformanceWorkspace } from "@/components/supplier-performance/SupplierPerformanceWorkspace";
import { ServerError } from "@/lib/server/errors";
import {
  getSupplierPerformanceDetail,
  getSupplierPerformanceSnapshot,
  resolveSupplierPerformanceFilters,
} from "@/lib/server/supplier-performance";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function SupplierPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; material?: string; compare?: string; supplier?: string }>;
}) {
  const params = await searchParams;
  let data;
  let initialDetail = null;
  try {
    const ctx = await getAuthenticatedTenantContext();
    const filters = resolveSupplierPerformanceFilters(params);
    data = await getSupplierPerformanceSnapshot(ctx, filters);
    if (params.supplier) {
      initialDetail = await getSupplierPerformanceDetail(ctx, params.supplier).catch(() => null);
    }
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-6">
        <PageHeader
          context="Procurement"
          title="Supplier Performance"
          description="Measure supplier outcomes from actual procurement history."
        />
        <EmptyState title="Unable to load supplier performance" description="Refresh and try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-5 overflow-x-hidden px-4 py-5 sm:px-6">
      <PageHeader
        context="Procurement"
        title="Supplier Performance"
        description="Measure supplier outcomes from actual procurement history."
        relatedPath="/supplier-performance"
        metadata={`${data.disclaimer} · ${data.generatedAt.slice(0, 10)}`}
      />
      <Suspense>
        <SupplierPerformanceWorkspace data={data} initialDetail={initialDetail} />
      </Suspense>
    </div>
  );
}
