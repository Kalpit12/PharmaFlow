import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { AdministrationWorkspace } from "@/components/administration/AdministrationWorkspace";
import { EmptyState } from "@/components/ds/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { getAdministrationSnapshot } from "@/lib/server/administration";
import { ServerError } from "@/lib/server/errors";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function AdministrationPage() {
  let data;
  try {
    const ctx = await getAuthenticatedTenantContext();
    data = await getAdministrationSnapshot(ctx);
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login?callbackUrl=%2Fadministration");
    if (error instanceof ServerError && error.code === "FORBIDDEN") redirect("/dashboard");
    return (
      <WorkspacePage width="wide">
        <PageHeader
          context="System"
          title="Administration"
          description="Workspace identity, people, operating resources, and master-data coverage."
        />
        <EmptyState title="Unable to load administration" description="Refresh the page or review workspace access." />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage width="wide">
      <PageHeader
        context="System"
        title="Administration"
        description="Workspace identity, people, operating resources, and master-data coverage."
        metadata={data.disclaimer}
        relatedPath="/administration"
        actions={
          data.canViewGovernance ? (
            <Link
              href="/governance"
              className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted sm:min-h-8"
            >
              <ShieldCheck className="size-4" aria-hidden />
              Governance
            </Link>
          ) : null
        }
      />
      <AdministrationWorkspace data={data} />
    </WorkspacePage>
  );
}
