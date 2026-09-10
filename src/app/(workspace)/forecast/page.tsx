import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { ForecastWorkspace } from "@/components/forecast/ForecastWorkspace";
import { PageHeader } from "@/components/layout/PageHeader";
import { getForecastSnapshot, resolveForecastHorizon } from "@/lib/server/forecasting";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ horizon?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getForecastSnapshot(ctx, resolveForecastHorizon(params));
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 overflow-x-hidden px-4 py-5 sm:px-6">
        <PageHeader context="Intelligence" title="Forecast" description="Near-term outlook across sales, production, and supply." />
        <EmptyState title="Unable to load forecast" description="Refresh the page and try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] min-w-0 flex-col gap-5 overflow-x-hidden px-4 py-5 sm:px-6">
      <PageHeader
        context="Intelligence"
        title="Forecast"
        description="Near-term outlook across sales, production, and supply."
        relatedPath="/forecast"
        metadata={`${data.disclaimer} · ${data.horizonLabel}`}
        actions={
          <a
            href={`/scenarios?horizon=${data.horizon}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted sm:min-h-8"
          >
            Test this forecast
          </a>
        }
      />
      <Suspense>
        <ForecastWorkspace data={data} />
      </Suspense>
    </div>
  );
}
