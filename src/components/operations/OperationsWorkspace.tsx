"use client";

import { useEffect } from "react";

import { useShell } from "@/components/layout/shell-context";
import { PlannerDashboardBuilder } from "@/components/operations/PlannerDashboardBuilder";
import { OperationsGanttWorkspace } from "@/components/operations/OperationsGanttWorkspace";
import { OperationsPlannerShell, type PlannerShellView } from "@/components/operations/OperationsPlannerShell";
import { PlannerAssistantWorkspace } from "@/components/operations/PlannerAssistantWorkspace";
import { PlannerApiWorkspace } from "@/components/operations/PlannerApiWorkspace";
import { PlannerDataImportWorkspace } from "@/components/operations/PlannerDataImportWorkspace";
import { PlannerIntegrationsWorkspace } from "@/components/operations/PlannerIntegrationsWorkspace";
import { PlannerEngineWorkspace } from "@/components/operations/PlannerEngineWorkspace";
import { PlantModelWorkspace } from "@/components/operations/PlantModelWorkspace";
import { ProductionOrdersWorkspace } from "@/components/operations/ProductionOrdersWorkspace";
import { WorkstationRosterWorkspace } from "@/components/operations/WorkstationRosterWorkspace";
import type { WorkstationRosterSnapshot } from "@/lib/server/workstation-roster";
import type { PlannerEngineSnapshot } from "@/lib/server/aps-plan";
import type { OperationsGanttSnapshot } from "@/lib/server/operations-gantt";
import type { PlannerDashboardPageData } from "@/lib/server/planner-dashboards";
import type { PlannerIntegrationSnapshot } from "@/lib/server/planner-integrations";
import type { PlantModelSnapshot } from "@/lib/server/plant-model";
import type { ProductionOrdersSnapshot } from "@/lib/server/production-orders-phase2";
import { cn } from "@/lib/utils";

const VIEWS: PlannerShellView[] = [
  "gantt",
  "dashboard",
  "plant",
  "roster",
  "orders",
  "engine",
  "integrations",
  "import",
  "api",
  "assistant",
];

function parseView(value: string | undefined): PlannerShellView {
  if (value && VIEWS.includes(value as PlannerShellView)) return value as PlannerShellView;
  return "gantt";
}

export function OperationsWorkspace({
  plant,
  orders,
  planner,
  gantt,
  integrations,
  dashboard,
  roster,
  canGlobalRules,
  initialView,
}: {
  plant: PlantModelSnapshot;
  orders: ProductionOrdersSnapshot;
  planner: PlannerEngineSnapshot;
  gantt: OperationsGanttSnapshot;
  integrations: PlannerIntegrationSnapshot;
  dashboard: PlannerDashboardPageData;
  roster: WorkstationRosterSnapshot | null;
  canGlobalRules: boolean;
  initialView?: string;
}) {
  const view = parseView(initialView);
  const { setNavChromeHidden } = useShell();

  useEffect(() => {
    setNavChromeHidden(view === "gantt");
    return () => setNavChromeHidden(false);
  }, [view, setNavChromeHidden]);

  return (
    <OperationsPlannerShell activeView={view}>
      {view === "gantt" ? (
        <OperationsGanttWorkspace data={gantt} canGlobalRules={canGlobalRules} />
      ) : (
        <div className={cn("min-w-0 overflow-auto p-4 sm:p-6", view === "dashboard" && "p-4")}>
          {view === "dashboard" ? <PlannerDashboardBuilder initial={dashboard} /> : null}
          {view === "plant" ? <PlantModelWorkspace data={plant} /> : null}
          {view === "roster" && roster ? <WorkstationRosterWorkspace data={roster} /> : null}
          {view === "orders" ? <ProductionOrdersWorkspace data={orders} /> : null}
          {view === "engine" ? <PlannerEngineWorkspace initial={planner} canGlobalRules={canGlobalRules} /> : null}
          {view === "integrations" ? <PlannerIntegrationsWorkspace data={integrations} /> : null}
          {view === "import" ? <PlannerDataImportWorkspace /> : null}
          {view === "api" ? <PlannerApiWorkspace canManage={canGlobalRules} /> : null}
          {view === "assistant" ? <PlannerAssistantWorkspace /> : null}
        </div>
      )}
    </OperationsPlannerShell>
  );
}
