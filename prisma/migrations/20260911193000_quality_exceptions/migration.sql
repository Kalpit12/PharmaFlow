-- CreateEnum
CREATE TYPE "QualityExceptionType" AS ENUM ('NON_CONFORMANCE', 'DEVIATION', 'QUALITY_INCIDENT', 'MATERIAL_ISSUE', 'BATCH_ISSUE', 'DOCUMENTATION_ISSUE', 'OTHER');
CREATE TYPE "QualityExceptionSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "QualityExceptionStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'ACTION_REQUIRED', 'RESOLVED', 'CLOSED');
CREATE TYPE "QualityCorrectiveActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "QualityException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "QualityExceptionType" NOT NULL,
    "severity" "QualityExceptionSeverity" NOT NULL,
    "status" "QualityExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "createdById" TEXT,
    "dueDate" TIMESTAMPTZ(6),
    "investigationNotes" TEXT,
    "findings" TEXT,
    "resolutionNotes" TEXT,
    "productionBatchId" TEXT,
    "productionOrderId" TEXT,
    "inventoryLotId" TEXT,
    "productId" TEXT,
    "orderId" TEXT,
    "customerId" TEXT,
    "resolvedAt" TIMESTAMPTZ(6),
    "closedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "QualityException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QualityCorrectiveAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT,
    "dueDate" TIMESTAMPTZ(6),
    "status" "QualityCorrectiveActionStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "QualityCorrectiveAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QualityExceptionEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" "QualityExceptionStatus",
    "toStatus" "QualityExceptionStatus",
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityExceptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QualityException_tenantId_reference_key" ON "QualityException"("tenantId", "reference");
CREATE INDEX "QualityException_tenantId_status_idx" ON "QualityException"("tenantId", "status");
CREATE INDEX "QualityException_tenantId_severity_idx" ON "QualityException"("tenantId", "severity");
CREATE INDEX "QualityException_tenantId_type_idx" ON "QualityException"("tenantId", "type");
CREATE INDEX "QualityException_tenantId_ownerId_idx" ON "QualityException"("tenantId", "ownerId");
CREATE INDEX "QualityException_tenantId_dueDate_idx" ON "QualityException"("tenantId", "dueDate");
CREATE INDEX "QualityException_tenantId_updatedAt_idx" ON "QualityException"("tenantId", "updatedAt");
CREATE INDEX "QualityException_productionBatchId_idx" ON "QualityException"("productionBatchId");

CREATE INDEX "QualityCorrectiveAction_tenantId_exceptionId_idx" ON "QualityCorrectiveAction"("tenantId", "exceptionId");
CREATE INDEX "QualityCorrectiveAction_tenantId_status_idx" ON "QualityCorrectiveAction"("tenantId", "status");

CREATE INDEX "QualityExceptionEvent_tenantId_exceptionId_idx" ON "QualityExceptionEvent"("tenantId", "exceptionId");
CREATE INDEX "QualityExceptionEvent_tenantId_createdAt_idx" ON "QualityExceptionEvent"("tenantId", "createdAt");

ALTER TABLE "QualityException" ADD CONSTRAINT "QualityException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualityException" ADD CONSTRAINT "QualityException_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityException" ADD CONSTRAINT "QualityException_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityException" ADD CONSTRAINT "QualityException_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "ProductionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityException" ADD CONSTRAINT "QualityException_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityException" ADD CONSTRAINT "QualityException_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityException" ADD CONSTRAINT "QualityException_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityException" ADD CONSTRAINT "QualityException_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QualityException" ADD CONSTRAINT "QualityException_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QualityCorrectiveAction" ADD CONSTRAINT "QualityCorrectiveAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualityCorrectiveAction" ADD CONSTRAINT "QualityCorrectiveAction_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "QualityException"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualityCorrectiveAction" ADD CONSTRAINT "QualityCorrectiveAction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QualityExceptionEvent" ADD CONSTRAINT "QualityExceptionEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualityExceptionEvent" ADD CONSTRAINT "QualityExceptionEvent_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "QualityException"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualityExceptionEvent" ADD CONSTRAINT "QualityExceptionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
