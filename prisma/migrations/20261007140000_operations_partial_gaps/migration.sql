-- Workstation resource kinds and shop-floor / integration / planning event foundations

CREATE TYPE "WorkstationKind" AS ENUM ('PRODUCTION_LINE', 'PACKAGING_LINE', 'CLEAN_ROOM', 'SUBCONTRACT');

CREATE TYPE "ProductionOperationEventType" AS ENUM ('START', 'STOP', 'DOWNTIME', 'SCRAP');

CREATE TYPE "PlanningEventType" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'AUTO_ACCEPTED', 'IMPORTED');

CREATE TYPE "RoutingResourceRole" AS ENUM ('STANDARD', 'ALTERNATE', 'SUBCONTRACT');

ALTER TABLE "Workstation" ADD COLUMN "kind" "WorkstationKind" NOT NULL DEFAULT 'PRODUCTION_LINE';

ALTER TABLE "RoutingOperationResource" ADD COLUMN "resourceRole" "RoutingResourceRole" NOT NULL DEFAULT 'STANDARD';

CREATE TABLE "ProductionOperationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productionOperationId" TEXT NOT NULL,
    "eventType" "ProductionOperationEventType" NOT NULL,
    "quantity" INTEGER,
    "reason" TEXT,
    "recordedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,

    CONSTRAINT "ProductionOperationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanningEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "schedulePlanId" TEXT,
    "eventType" "PlanningEventType" NOT NULL,
    "summary" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationImportReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'production-orders',
    "idempotencyKey" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationImportReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationImportReceipt_tenantId_source_idempotencyKey_key" ON "IntegrationImportReceipt"("tenantId", "source", "idempotencyKey");
CREATE INDEX "ProductionOperationEvent_tenantId_productionOperationId_idx" ON "ProductionOperationEvent"("tenantId", "productionOperationId");
CREATE INDEX "PlanningEvent_tenantId_createdAt_idx" ON "PlanningEvent"("tenantId", "createdAt");
CREATE UNIQUE INDEX "PlanningEvent_tenantId_idempotencyKey_key" ON "PlanningEvent"("tenantId", "idempotencyKey");

ALTER TABLE "ProductionOperationEvent" ADD CONSTRAINT "ProductionOperationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOperationEvent" ADD CONSTRAINT "ProductionOperationEvent_productionOperationId_fkey" FOREIGN KEY ("productionOperationId") REFERENCES "ProductionOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOperationEvent" ADD CONSTRAINT "ProductionOperationEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanningEvent" ADD CONSTRAINT "PlanningEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanningEvent" ADD CONSTRAINT "PlanningEvent_schedulePlanId_fkey" FOREIGN KEY ("schedulePlanId") REFERENCES "SchedulePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanningEvent" ADD CONSTRAINT "PlanningEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrationImportReceipt" ADD CONSTRAINT "IntegrationImportReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
