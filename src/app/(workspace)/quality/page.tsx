import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { QualityWorkspace } from "@/components/quality/QualityWorkspace";
import { ServerError } from "@/lib/server/errors";
import { getQualitySnapshot, resolveQualityFilters } from "@/lib/server/quality";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; exception?: string; q?: string; type?: string; severity?: string; owner?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getQualitySnapshot(ctx, resolveQualityFilters(params));
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <WorkspacePage>
        <PageHeader
          context="Operations"
          title="Quality"
          description="Control exceptions, investigations and quality decisions."
        />
        <EmptyState title="Unable to load quality workspace" description="Refresh the page." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="Operations"
        title="Quality"
        description="Control exceptions, investigations and quality decisions — operational quality management, not a validated QMS."
        metadata={data.disclaimer}
        relatedPath="/quality"
      />
      <Suspense>
        <QualityWorkspace data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
