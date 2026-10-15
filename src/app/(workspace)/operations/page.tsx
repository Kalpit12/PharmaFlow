import { redirect } from "next/navigation";

import { can } from "@/lib/auth/authorization";
import { OperationsWorkspace } from "@/components/operations/OperationsWorkspace";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkspacePage } from "@/components/layout/WorkspacePage";
import { ServerError } from "@/lib/server/errors";
import { getPlannerEngineSnapshot } from "@/lib/server/aps-plan";
import { getPlantModelSnapshot } from "@/lib/server/plant-model";
import { getOperationsGanttSnapshot } from "@/lib/server/operations-gantt";
import { getPlannerDashboardPageData } from "@/lib/server/planner-dashboards";
import { getPlannerIntegrationSnapshot } from "@/lib/server/planner-integrations";
import { getProductionOrdersSnapshot } from "@/lib/server/production-orders-phase2";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";

export const dynamic = "force-dynamic";

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ dashboard?: string }>;
}) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const params = await searchParams;
    const canGlobalRules = can(ctx.role, "production.global_rules");
    const [plant, orders, planner, gantt, integrations, dashboard] = await Promise.all([
      getPlantModelSnapshot(ctx),
      getProductionOrdersSnapshot(ctx),
      getPlannerEngineSnapshot(ctx),
      getOperationsGanttSnapshot(ctx, 2),
      getPlannerIntegrationSnapshot(ctx),
      getPlannerDashboardPageData(ctx, params.dashboard),
    ]);

    return (
      <WorkspacePage width="full">
        <PageHeader
          context="Operations"
          title="Operations planner"
          description="Gantt schedule, plant model, orders, and propose → accept engine (SkyPlanner-aligned rebuild)."
        />
        <OperationsWorkspace
          plant={plant}
          orders={orders}
          planner={planner}
          gantt={gantt}
          integrations={integrations}
          dashboard={dashboard}
          canGlobalRules={canGlobalRules}
        />
      </WorkspacePage>
    );
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") redirect("/login");
    console.error("Operations workspace failed", error);
    return (
      <WorkspacePage width="full">
        <PageHeader context="Operations" title="Operations planner" description="Configure production resources and orders." />
        <p className="text-sm text-muted-foreground">
          Unable to load operations data. If you recently pulled schema changes, run{" "}
          <code className="text-xs">npm run db:deploy:direct</code> then <code className="text-xs">npm run db:generate</code>.
        </p>
      </WorkspacePage>
    );
  }
}
