-- Persisted work calendars, planning policy, and versioned schedule plans.
CREATE TYPE "SchedulePlanStatus" AS ENUM (
  'DRAFT',
  'PROPOSED',
  'ACCEPTED',
  'REJECTED',
  'SUPERSEDED'
);

CREATE TYPE "SchedulePlanSource" AS ENUM (
  'MANUAL',
  'AUTO_SCHEDULE',
  'EVENT',
  'AUTOPILOT'
);

CREATE TYPE "AutopilotMode" AS ENUM (
  'OFF',
  'PROPOSE_ONLY',
  'AUTO_ACCEPT_UNLOCKED'
);

CREATE TABLE "WorkstationShift" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "workstationId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  CONSTRAINT "WorkstationShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkstationCalendarException" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "workstationId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "closed" BOOLEAN NOT NULL DEFAULT true,
  "startMinute" INTEGER,
  "endMinute" INTEGER,
  CONSTRAINT "WorkstationCalendarException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanningPolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "priorityWeight" INTEGER NOT NULL DEFAULT 40,
  "dueDateWeight" INTEGER NOT NULL DEFAULT 35,
  "changeoverWeight" INTEGER NOT NULL DEFAULT 15,
  "utilizationWeight" INTEGER NOT NULL DEFAULT 10,
  "freezeMinutes" INTEGER NOT NULL DEFAULT 480,
  "autopilotMode" "AutopilotMode" NOT NULL DEFAULT 'OFF',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "PlanningPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchedulePlan" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "status" "SchedulePlanStatus" NOT NULL DEFAULT 'DRAFT',
  "source" "SchedulePlanSource" NOT NULL DEFAULT 'MANUAL',
  "windowStart" TIMESTAMPTZ(6) NOT NULL,
  "windowEnd" TIMESTAMPTZ(6) NOT NULL,
  "priorityWeight" INTEGER NOT NULL DEFAULT 40,
  "dueDateWeight" INTEGER NOT NULL DEFAULT 35,
  "changeoverWeight" INTEGER NOT NULL DEFAULT 15,
  "utilizationWeight" INTEGER NOT NULL DEFAULT 10,
  "summary" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  "acceptedAt" TIMESTAMPTZ(6),
  "acceptedById" TEXT,
  CONSTRAINT "SchedulePlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchedulePlanOrder" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "proposedWorkstationId" TEXT,
  "proposedStart" TIMESTAMPTZ(6),
  "proposedEnd" TIMESTAMPTZ(6),
  "previousStart" TIMESTAMPTZ(6),
  "previousEnd" TIMESTAMPTZ(6),
  "materialState" TEXT NOT NULL,
  "isLocked" BOOLEAN NOT NULL,
  "changeMinutes" INTEGER NOT NULL DEFAULT 0,
  "deliveryDeltaMinutes" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SchedulePlanOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchedulePlanOperation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "productionOperationId" TEXT NOT NULL,
  "workstationId" TEXT,
  "proposedStart" TIMESTAMPTZ(6),
  "proposedEnd" TIMESTAMPTZ(6),
  "changeoverMinutes" INTEGER NOT NULL DEFAULT 0,
  "appliedChangeoverRuleId" TEXT,
  "isLocked" BOOLEAN NOT NULL,
  CONSTRAINT "SchedulePlanOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkstationShift_workstationId_weekday_startMinute_key" ON "WorkstationShift"("workstationId", "weekday", "startMinute");
CREATE INDEX "WorkstationShift_tenantId_workstationId_idx" ON "WorkstationShift"("tenantId", "workstationId");
CREATE UNIQUE INDEX "WorkstationCalendarException_workstationId_date_key" ON "WorkstationCalendarException"("workstationId", "date");
CREATE INDEX "WorkstationCalendarException_tenantId_date_idx" ON "WorkstationCalendarException"("tenantId", "date");
CREATE UNIQUE INDEX "PlanningPolicy_tenantId_key" ON "PlanningPolicy"("tenantId");
CREATE UNIQUE INDEX "SchedulePlan_tenantId_version_key" ON "SchedulePlan"("tenantId", "version");
CREATE INDEX "SchedulePlan_tenantId_status_createdAt_idx" ON "SchedulePlan"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "SchedulePlanOrder_planId_productionOrderId_key" ON "SchedulePlanOrder"("planId", "productionOrderId");
CREATE INDEX "SchedulePlanOrder_tenantId_productionOrderId_idx" ON "SchedulePlanOrder"("tenantId", "productionOrderId");
CREATE UNIQUE INDEX "SchedulePlanOperation_planId_productionOperationId_key" ON "SchedulePlanOperation"("planId", "productionOperationId");
CREATE INDEX "SchedulePlanOperation_tenantId_productionOperationId_idx" ON "SchedulePlanOperation"("tenantId", "productionOperationId");
CREATE INDEX "SchedulePlanOperation_planId_workstationId_proposedStart_idx" ON "SchedulePlanOperation"("planId", "workstationId", "proposedStart");

ALTER TABLE "WorkstationShift" ADD CONSTRAINT "WorkstationShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkstationShift" ADD CONSTRAINT "WorkstationShift_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkstationCalendarException" ADD CONSTRAINT "WorkstationCalendarException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkstationCalendarException" ADD CONSTRAINT "WorkstationCalendarException_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanningPolicy" ADD CONSTRAINT "PlanningPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePlan" ADD CONSTRAINT "SchedulePlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePlan" ADD CONSTRAINT "SchedulePlan_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchedulePlanOrder" ADD CONSTRAINT "SchedulePlanOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePlanOrder" ADD CONSTRAINT "SchedulePlanOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SchedulePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePlanOrder" ADD CONSTRAINT "SchedulePlanOrder_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePlanOrder" ADD CONSTRAINT "SchedulePlanOrder_proposedWorkstationId_fkey" FOREIGN KEY ("proposedWorkstationId") REFERENCES "Workstation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchedulePlanOperation" ADD CONSTRAINT "SchedulePlanOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePlanOperation" ADD CONSTRAINT "SchedulePlanOperation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SchedulePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePlanOperation" ADD CONSTRAINT "SchedulePlanOperation_productionOperationId_fkey" FOREIGN KEY ("productionOperationId") REFERENCES "ProductionOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePlanOperation" ADD CONSTRAINT "SchedulePlanOperation_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
