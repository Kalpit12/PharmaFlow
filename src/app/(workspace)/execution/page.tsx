import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { ExecutionWorkspace } from "@/components/execution/ExecutionWorkspace";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { getExecutionSnapshot } from "@/lib/server/execution";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function ExecutionPage() {
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getExecutionSnapshot(ctx);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <WorkspacePage width="standard">
        <PageHeader
          context="Overview"
          title="Execution"
          description="What is actually happening now — review, ready, executed, blocked."
        />
        <EmptyState title="Unable to load execution queue" description="Refresh the page and try again." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage width="standard">
      <PageHeader
        context="Overview"
        title="Execution"
        description="What is actually happening now — review, ready, executed, blocked."
        relatedPath="/execution"
        metadata={data.disclaimer}
      />
      <Suspense>
        <ExecutionWorkspace data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
