import { redirect } from "next/navigation";

import { DailyReviewWorkspace } from "@/components/daily-review/DailyReviewWorkspace";
import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { getDailyReviewSnapshot } from "@/lib/server/daily-review";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function DailyReviewPage() {
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getDailyReviewSnapshot(ctx);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <WorkspacePage width="standard">
        <PageHeader
          context="Overview"
          title="Daily Review"
          description="Today's operational and commercial priorities, ranked by evidence."
        />
        <EmptyState title="Unable to load daily review" description="Refresh the page and try again." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage width="standard">
      <PageHeader
        context="Overview"
        title="Daily Review"
        description="Today's operational and commercial priorities, ranked by evidence."
        metadata={data.disclaimer}
        relatedPath="/daily-review"
        actions={
          <a
            href="/command-center"
            className="inline-flex min-h-11 items-center justify-center rounded-sm border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted sm:min-h-8"
          >
            Command Center
          </a>
        }
      />
      <DailyReviewWorkspace data={data} />
    </WorkspacePage>
  );
}
