import { redirect } from "next/navigation";

import { DashboardHeaderActions } from "@/components/dashboard/DashboardHeaderActions";
import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { getDashboardData } from "@/lib/server/dashboard";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext, getAuthenticatedUser } from "@/lib/server/tenant-context";
import { workspaceLoginPath } from "@/lib/auth/login-redirect";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    const user = await getAuthenticatedUser();
    data = await getDashboardData(ctx, undefined, { userName: user.name });
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      redirect(workspaceLoginPath("/dashboard"));
    }
    return (
      <WorkspacePage>
        <PageHeader context="Insights" title="Dashboard" description="Commercial performance and follow-up." />
        <p className="text-sm text-muted-foreground">Unable to load workspace data. Try again later.</p>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <PageHeader
        context="Insights"
        title="Dashboard"
        description="Commercial performance, sales trend, and items that need follow-up."
        metadata={data.disclaimer}
        relatedPath="/dashboard"
        actions={<DashboardHeaderActions orderForm={data.orderForm} />}
      />
      <DashboardWorkspace data={data} />
    </WorkspacePage>
  );
}
