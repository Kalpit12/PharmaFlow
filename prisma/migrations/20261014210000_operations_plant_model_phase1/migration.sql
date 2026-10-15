-- Phase 1 plant resource model (additive)

CREATE TYPE "WorkstationQualificationStatus" AS ENUM ('QUALIFIED', 'DUE', 'EXPIRED');
CREATE TYPE "WorkstationCleanStatus" AS ENUM ('CLEAN', 'DIRTY');
CREATE TYPE "ChangeoverLevel" AS ENUM ('NONE', 'MINOR', 'MAJOR');

CREATE TABLE "PlantSite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlantSite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantDepartment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlantDepartment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantRoom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sharedCapacity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlantRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkstationGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkstationGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionTool" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "broken" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceUntil" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductionTool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionToolWorkstation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "workstationId" TEXT NOT NULL,

    CONSTRAINT "ProductionToolWorkstation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Workstation" ADD COLUMN "siteId" TEXT;
ALTER TABLE "Workstation" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Workstation" ADD COLUMN "roomId" TEXT;
ALTER TABLE "Workstation" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Workstation" ADD COLUMN "efficiencyCoefficient" DECIMAL(4,2) NOT NULL DEFAULT 1;
ALTER TABLE "Workstation" ADD COLUMN "qualificationStatus" "WorkstationQualificationStatus" NOT NULL DEFAULT 'QUALIFIED';
ALTER TABLE "Workstation" ADD COLUMN "calibrationDueDate" DATE;
ALTER TABLE "Workstation" ADD COLUMN "cleanStatus" "WorkstationCleanStatus" NOT NULL DEFAULT 'CLEAN';
ALTER TABLE "Workstation" ADD COLUMN "cleanHoldExpiresAt" TIMESTAMPTZ(6);
ALTER TABLE "Workstation" ADD COLUMN "allowedParallelJobs" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "RoutingOperation" ADD COLUMN "minCompletionPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RoutingOperation" ADD COLUMN "maxHoldHours" INTEGER;
ALTER TABLE "RoutingOperation" ADD COLUMN "requiresLineClearance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RoutingOperation" ADD COLUMN "isQcHold" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ChangeoverRule" ADD COLUMN "level" "ChangeoverLevel" NOT NULL DEFAULT 'MINOR';
ALTER TABLE "ChangeoverRule" ADD COLUMN "maxCampaignBatches" INTEGER;

CREATE UNIQUE INDEX "PlantSite_tenantId_code_key" ON "PlantSite"("tenantId", "code");
CREATE INDEX "PlantSite_tenantId_idx" ON "PlantSite"("tenantId");

CREATE UNIQUE INDEX "PlantDepartment_tenantId_code_key" ON "PlantDepartment"("tenantId", "code");
CREATE INDEX "PlantDepartment_tenantId_siteId_idx" ON "PlantDepartment"("tenantId", "siteId");

CREATE UNIQUE INDEX "PlantRoom_tenantId_code_key" ON "PlantRoom"("tenantId", "code");
CREATE INDEX "PlantRoom_tenantId_siteId_idx" ON "PlantRoom"("tenantId", "siteId");

CREATE UNIQUE INDEX "WorkstationGroup_tenantId_code_key" ON "WorkstationGroup"("tenantId", "code");
CREATE INDEX "WorkstationGroup_tenantId_idx" ON "WorkstationGroup"("tenantId");

CREATE UNIQUE INDEX "ProductionTool_tenantId_code_key" ON "ProductionTool"("tenantId", "code");
CREATE INDEX "ProductionTool_tenantId_idx" ON "ProductionTool"("tenantId");

CREATE UNIQUE INDEX "ProductionToolWorkstation_toolId_workstationId_key" ON "ProductionToolWorkstation"("toolId", "workstationId");
CREATE INDEX "ProductionToolWorkstation_tenantId_workstationId_idx" ON "ProductionToolWorkstation"("tenantId", "workstationId");

CREATE INDEX "Workstation_tenantId_siteId_idx" ON "Workstation"("tenantId", "siteId");
CREATE INDEX "Workstation_tenantId_groupId_idx" ON "Workstation"("tenantId", "groupId");

ALTER TABLE "PlantSite" ADD CONSTRAINT "PlantSite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDepartment" ADD CONSTRAINT "PlantDepartment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantDepartment" ADD CONSTRAINT "PlantDepartment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "PlantSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantRoom" ADD CONSTRAINT "PlantRoom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantRoom" ADD CONSTRAINT "PlantRoom_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "PlantSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantRoom" ADD CONSTRAINT "PlantRoom_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "PlantDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkstationGroup" ADD CONSTRAINT "WorkstationGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionTool" ADD CONSTRAINT "ProductionTool_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionToolWorkstation" ADD CONSTRAINT "ProductionToolWorkstation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionToolWorkstation" ADD CONSTRAINT "ProductionToolWorkstation_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "ProductionTool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionToolWorkstation" ADD CONSTRAINT "ProductionToolWorkstation_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "PlantSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "PlantDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "PlantRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkstationGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
