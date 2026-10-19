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
import { workspaceLoginPath } from "@/lib/auth/login-redirect";
import { getAuthenticatedTenantContext } from "@/lib/server/tenant-context";
import { getWorkstationRosterSnapshot } from "@/lib/server/workstation-roster";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    dashboard?: string;
    ganttZoom?: string;
    ganttStart?: string;
    ganttEnd?: string;
    ganttRows?: string;
    rosterWeek?: string;
  }>;
}) {
  try {
    const ctx = await getAuthenticatedTenantContext();
    const params = await searchParams;
    const canGlobalRules = can(ctx.role, "production.global_rules");
    const needRoster = params.view === "roster";
    const [plant, orders, planner, gantt, integrations, dashboard, roster] = await Promise.all([
      getPlantModelSnapshot(ctx),
      getProductionOrdersSnapshot(ctx),
      getPlannerEngineSnapshot(ctx),
      getOperationsGanttSnapshot(ctx, {
        zoom: params.ganttZoom,
        start: params.ganttStart,
        end: params.ganttEnd,
        ganttRows: params.ganttRows,
      }),
      getPlannerIntegrationSnapshot(ctx),
      getPlannerDashboardPageData(ctx, params.dashboard),
      needRoster ? getWorkstationRosterSnapshot(ctx, params.rosterWeek) : Promise.resolve(null),
    ]);

    const isGantt = !params.view || params.view === "gantt";

    return (
      <WorkspacePage width="full" className={isGantt ? "gap-0 px-0 py-0 sm:px-0 lg:px-0" : undefined}>
        {isGantt ? null : (
          <div className="px-4 pt-4 sm:px-6 lg:px-8">
            <PageHeader
              context="Operations"
              title="Operations planner"
              description="Plant model, orders, engine, and integrations."
            />
          </div>
        )}
        <OperationsWorkspace
          plant={plant}
          orders={orders}
          planner={planner}
          gantt={gantt}
          integrations={integrations}
          dashboard={dashboard}
          roster={roster}
          canGlobalRules={canGlobalRules}
          initialView={params.view}
        />
      </WorkspacePage>
    );
  } catch (error) {
    if (error instanceof ServerError && error.code === "UNAUTHORIZED") {
      const returnPath = (await headers()).get("x-workspace-return") ?? "/operations";
      redirect(workspaceLoginPath(returnPath));
    }
    console.error("Operations workspace failed", error);
    const prismaCode =
      error && typeof error === "object" && "code" in error ? String((error as { code: string }).code) : "";
    const migrationHint =
      prismaCode === "P2022" || (error instanceof Error && /column|does not exist|hazardClass|dedicatedTo/i.test(error.message))
        ? "Database schema is behind the app — run prisma migrate deploy on the same DATABASE_URL Vercel uses (see npm run db:check-migrations)."
        : prismaCode === "P1001" || prismaCode === "P1002"
          ? "Database connection failed — check DATABASE_URL on Vercel (Production + Preview) and Neon status."
          : "If this persists after deploy, check Vercel function logs for the /operations request.";
    return (
      <WorkspacePage width="full">
        <PageHeader context="Operations" title="Operations planner" description="Configure production resources and orders." />
        <p className="text-sm text-muted-foreground">
          Unable to load operations data. {migrationHint}
        </p>
      </WorkspacePage>
    );
  }
}
