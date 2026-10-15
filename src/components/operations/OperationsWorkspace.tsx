"use client";

import { PlannerDashboardBuilder } from "@/components/operations/PlannerDashboardBuilder";
import { OperationsGanttWorkspace } from "@/components/operations/OperationsGanttWorkspace";
import { PlannerAssistantWorkspace } from "@/components/operations/PlannerAssistantWorkspace";
import { PlannerApiWorkspace } from "@/components/operations/PlannerApiWorkspace";
import { PlannerDataImportWorkspace } from "@/components/operations/PlannerDataImportWorkspace";
import { PlannerIntegrationsWorkspace } from "@/components/operations/PlannerIntegrationsWorkspace";
import { PlannerEngineWorkspace } from "@/components/operations/PlannerEngineWorkspace";
import { PlantModelWorkspace } from "@/components/operations/PlantModelWorkspace";
import { ProductionOrdersWorkspace } from "@/components/operations/ProductionOrdersWorkspace";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PlannerEngineSnapshot } from "@/lib/server/aps-plan";
import type { OperationsGanttSnapshot } from "@/lib/server/operations-gantt";
import type { PlannerDashboardPageData } from "@/lib/server/planner-dashboards";
import type { PlannerIntegrationSnapshot } from "@/lib/server/planner-integrations";
import type { PlantModelSnapshot } from "@/lib/server/plant-model";
import type { ProductionOrdersSnapshot } from "@/lib/server/production-orders-phase2";

export function OperationsWorkspace({
  plant,
  orders,
  planner,
  gantt,
  integrations,
  dashboard,
  canGlobalRules,
}: {
  plant: PlantModelSnapshot;
  orders: ProductionOrdersSnapshot;
  planner: PlannerEngineSnapshot;
  gantt: OperationsGanttSnapshot;
  integrations: PlannerIntegrationSnapshot;
  dashboard: PlannerDashboardPageData;
  canGlobalRules: boolean;
}) {
  return (
    <Tabs defaultValue="gantt" className="min-w-0">
      <TabsList>
        <TabsTrigger value="gantt">Schedule (Gantt)</TabsTrigger>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="plant">Plant model</TabsTrigger>
        <TabsTrigger value="orders">Orders & prospects</TabsTrigger>
        <TabsTrigger value="engine">Planner engine</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
        <TabsTrigger value="import">Data import</TabsTrigger>
        <TabsTrigger value="api">API & webhooks</TabsTrigger>
        <TabsTrigger value="assistant">Assistant</TabsTrigger>
      </TabsList>
      <TabsContent value="gantt" className="mt-4 min-w-0">
        <OperationsGanttWorkspace data={gantt} />
      </TabsContent>
      <TabsContent value="dashboard" className="mt-4 min-w-0" id="dashboard">
        <PlannerDashboardBuilder initial={dashboard} />
      </TabsContent>
      <TabsContent value="plant" className="mt-4 min-w-0">
        <PlantModelWorkspace data={plant} />
      </TabsContent>
      <TabsContent value="orders" className="mt-4 min-w-0">
        <ProductionOrdersWorkspace data={orders} />
      </TabsContent>
      <TabsContent value="engine" className="mt-4 min-w-0">
        <PlannerEngineWorkspace initial={planner} canGlobalRules={canGlobalRules} />
      </TabsContent>
      <TabsContent value="integrations" className="mt-4 min-w-0">
        <PlannerIntegrationsWorkspace data={integrations} />
      </TabsContent>
      <TabsContent value="import" className="mt-4 min-w-0">
        <PlannerDataImportWorkspace />
      </TabsContent>
      <TabsContent value="api" className="mt-4 min-w-0">
        <PlannerApiWorkspace canManage={canGlobalRules} />
      </TabsContent>
      <TabsContent value="assistant" className="mt-4 min-w-0">
        <PlannerAssistantWorkspace />
      </TabsContent>
    </Tabs>
  );
}
