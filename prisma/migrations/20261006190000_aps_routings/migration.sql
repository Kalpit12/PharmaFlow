-- Additive APS routing and operation model. Existing production orders remain valid
-- and are instantiated from active routings by the application.
CREATE TYPE "ProductionOperationStatus" AS ENUM (
  'UNSCHEDULED',
  'SCHEDULED',
  'READY',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'BLOCKED'
);

CREATE TABLE "ProductRouting" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ProductRouting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoutingOperation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "routingId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "runMinutesPerBatch" INTEGER NOT NULL,
  "setupMinutes" INTEGER NOT NULL DEFAULT 0,
  "teardownMinutes" INTEGER NOT NULL DEFAULT 0,
  "changeoverFamily" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RoutingOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoutingOperationResource" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "routingOperationId" TEXT NOT NULL,
  "workstationId" TEXT NOT NULL,
  "efficiencyPercent" INTEGER NOT NULL DEFAULT 100,
  "preferred" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "RoutingOperationResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoutingDependency" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fromOperationId" TEXT NOT NULL,
  "toOperationId" TEXT NOT NULL,
  "minimumLagMinutes" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RoutingDependency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionOperation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "routingOperationId" TEXT,
  "operationCode" TEXT NOT NULL,
  "operationName" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "workstationId" TEXT,
  "durationMinutes" INTEGER NOT NULL,
  "setupMinutes" INTEGER NOT NULL DEFAULT 0,
  "teardownMinutes" INTEGER NOT NULL DEFAULT 0,
  "changeoverFamily" TEXT,
  "status" "ProductionOperationStatus" NOT NULL DEFAULT 'UNSCHEDULED',
  "plannedStart" TIMESTAMPTZ(6),
  "plannedEnd" TIMESTAMPTZ(6),
  "actualStart" TIMESTAMPTZ(6),
  "actualEnd" TIMESTAMPTZ(6),
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ProductionOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChangeoverRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "workstationId" TEXT,
  "fromFamily" TEXT NOT NULL,
  "toFamily" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ChangeoverRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductRouting_tenantId_active_idx" ON "ProductRouting"("tenantId", "active");
CREATE INDEX "ProductRouting_tenantId_productId_idx" ON "ProductRouting"("tenantId", "productId");
CREATE UNIQUE INDEX "ProductRouting_productId_version_key" ON "ProductRouting"("productId", "version");
CREATE INDEX "RoutingOperation_tenantId_routingId_idx" ON "RoutingOperation"("tenantId", "routingId");
CREATE UNIQUE INDEX "RoutingOperation_routingId_code_key" ON "RoutingOperation"("routingId", "code");
CREATE UNIQUE INDEX "RoutingOperation_routingId_sequence_key" ON "RoutingOperation"("routingId", "sequence");
CREATE INDEX "RoutingOperationResource_tenantId_workstationId_idx" ON "RoutingOperationResource"("tenantId", "workstationId");
CREATE UNIQUE INDEX "RoutingOperationResource_routingOperationId_workstationId_key" ON "RoutingOperationResource"("routingOperationId", "workstationId");
CREATE INDEX "RoutingDependency_tenantId_idx" ON "RoutingDependency"("tenantId");
CREATE INDEX "RoutingDependency_toOperationId_idx" ON "RoutingDependency"("toOperationId");
CREATE UNIQUE INDEX "RoutingDependency_fromOperationId_toOperationId_key" ON "RoutingDependency"("fromOperationId", "toOperationId");
CREATE INDEX "ProductionOperation_tenantId_status_idx" ON "ProductionOperation"("tenantId", "status");
CREATE INDEX "ProductionOperation_tenantId_workstationId_plannedStart_idx" ON "ProductionOperation"("tenantId", "workstationId", "plannedStart");
CREATE INDEX "ProductionOperation_routingOperationId_idx" ON "ProductionOperation"("routingOperationId");
CREATE UNIQUE INDEX "ProductionOperation_productionOrderId_sequence_key" ON "ProductionOperation"("productionOrderId", "sequence");
CREATE INDEX "ChangeoverRule_tenantId_workstationId_idx" ON "ChangeoverRule"("tenantId", "workstationId");
CREATE UNIQUE INDEX "ChangeoverRule_tenantId_workstationId_fromFamily_toFamily_key" ON "ChangeoverRule"("tenantId", "workstationId", "fromFamily", "toFamily");

ALTER TABLE "ProductRouting" ADD CONSTRAINT "ProductRouting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductRouting" ADD CONSTRAINT "ProductRouting_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutingOperation" ADD CONSTRAINT "RoutingOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutingOperation" ADD CONSTRAINT "RoutingOperation_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "ProductRouting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutingOperationResource" ADD CONSTRAINT "RoutingOperationResource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutingOperationResource" ADD CONSTRAINT "RoutingOperationResource_routingOperationId_fkey" FOREIGN KEY ("routingOperationId") REFERENCES "RoutingOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutingOperationResource" ADD CONSTRAINT "RoutingOperationResource_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutingDependency" ADD CONSTRAINT "RoutingDependency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutingDependency" ADD CONSTRAINT "RoutingDependency_fromOperationId_fkey" FOREIGN KEY ("fromOperationId") REFERENCES "RoutingOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutingDependency" ADD CONSTRAINT "RoutingDependency_toOperationId_fkey" FOREIGN KEY ("toOperationId") REFERENCES "RoutingOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOperation" ADD CONSTRAINT "ProductionOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOperation" ADD CONSTRAINT "ProductionOperation_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOperation" ADD CONSTRAINT "ProductionOperation_routingOperationId_fkey" FOREIGN KEY ("routingOperationId") REFERENCES "RoutingOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOperation" ADD CONSTRAINT "ProductionOperation_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChangeoverRule" ADD CONSTRAINT "ChangeoverRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChangeoverRule" ADD CONSTRAINT "ChangeoverRule_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
