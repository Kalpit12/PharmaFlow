-- Phase 7–8: planner dashboards, widgets, planner access role, department scope

CREATE TYPE "PlannerAccessRole" AS ENUM ('OPERATOR', 'SUPERVISOR', 'PLANNER', 'HEAD_PLANNER', 'QA', 'SALES', 'EXECUTIVE');
CREATE TYPE "PlannerWidgetType" AS ENUM (
  'KPI_STRIP',
  'CAPACITY_LOAD_FACTOR',
  'WORKSTATION_UTILIZATION',
  'BOTTLENECK',
  'OTIF',
  'SCHEDULE_ADHERENCE',
  'LATE_JOBS',
  'JOBS_STARTED_COMPLETED',
  'CHANGEOVER_HOURS',
  'OEE_BY_WORKSTATION',
  'JOB_REPORT',
  'TIMELOG_REPORT',
  'ORDER_ITEM_REPORT'
);

ALTER TABLE "User" ADD COLUMN "plannerAccessRole" "PlannerAccessRole";
ALTER TABLE "User" ADD COLUMN "plantDepartmentId" TEXT;

CREATE TABLE "PlannerDashboard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "dateFrom" TIMESTAMPTZ(6),
    "dateTo" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlannerDashboard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlannerDashboardWidget" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "widgetType" "PlannerWidgetType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlannerDashboardWidget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlannerDashboard_tenantId_userId_idx" ON "PlannerDashboard"("tenantId", "userId");
CREATE INDEX "PlannerDashboardWidget_dashboardId_sortOrder_idx" ON "PlannerDashboardWidget"("dashboardId", "sortOrder");
CREATE UNIQUE INDEX "PlannerDashboardWidget_dashboardId_widgetType_key" ON "PlannerDashboardWidget"("dashboardId", "widgetType");
CREATE INDEX "User_plantDepartmentId_idx" ON "User"("plantDepartmentId");

ALTER TABLE "User" ADD CONSTRAINT "User_plantDepartmentId_fkey" FOREIGN KEY ("plantDepartmentId") REFERENCES "PlantDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlannerDashboard" ADD CONSTRAINT "PlannerDashboard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannerDashboard" ADD CONSTRAINT "PlannerDashboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannerDashboardWidget" ADD CONSTRAINT "PlannerDashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "PlannerDashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
