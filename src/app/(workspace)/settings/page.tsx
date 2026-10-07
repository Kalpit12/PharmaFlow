import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { ServerError } from "@/lib/server/errors";
import { getSettingsSnapshot } from "@/lib/server/settings";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getSettingsSnapshot(ctx);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login?callbackUrl=%2Fsettings");
    return (
      <WorkspacePage width="wide">
        <PageHeader
          context="System"
          title="Settings"
          description="Personal display preferences, account context, and security posture."
        />
        <EmptyState title="Unable to load settings" description="Refresh the page or sign in again." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage width="wide">
      <PageHeader
        context="System"
        title="Settings"
        description="Personal display preferences, account context, and security posture."
        metadata={data.disclaimer}
        relatedPath="/settings"
      />
      <SettingsWorkspace data={data} />
    </WorkspacePage>
  );
}
