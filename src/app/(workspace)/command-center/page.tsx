import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CommandCenterWorkspace } from "@/components/command-center/CommandCenterWorkspace";
import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { getCommandCenterSnapshot } from "@/lib/server/command-center";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getCommandCenterSnapshot(ctx);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    return (
      <WorkspacePage>
        <PageHeader
          context="Overview"
          title="Command Center"
          description="Business operating state, ranked attention, and where to inspect next."
        />
        <EmptyState title="Unable to load command center" description="Refresh the page and try again." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="Overview"
        title="Command Center"
        description="Pharmaceutical operations command — business state, ranked attention, and where to inspect next."
        metadata={`${data.disclaimer} · ${data.brand}`}
        relatedPath="/command-center"
      />
      <Suspense>
        <CommandCenterWorkspace data={data} />
      </Suspense>
    </WorkspacePage>
  );
}
