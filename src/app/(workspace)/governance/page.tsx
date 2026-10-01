import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { GovernanceWorkspace } from "@/components/governance/GovernanceWorkspace";
import { ServerError } from "@/lib/server/errors";
import { getGovernanceSnapshot } from "@/lib/server/governance";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getGovernanceSnapshot(ctx);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    if (error instanceof ServerError && error.code === "FORBIDDEN") redirect("/dashboard");
    return (
      <WorkspacePage>
        <PageHeader
          context="System"
          title="Governance"
          description="Control access, approvals and operational accountability."
        />
        <EmptyState title="Unable to load governance workspace" description="Refresh the page." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="System"
        title="Governance"
        description="Control access, approvals and operational accountability."
        metadata={data.disclaimer}
        relatedPath="/governance"
      />
      <Suspense>
        <GovernanceWorkspace data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
