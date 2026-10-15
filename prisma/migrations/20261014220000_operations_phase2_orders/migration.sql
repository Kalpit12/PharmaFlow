-- Phase 2: orders, prospects, batch sizing, campaigns, attachments

CREATE TYPE "ProductionScheduleDirection" AS ENUM ('FORWARD', 'JIT');
CREATE TYPE "ProductionOrderKind" AS ENUM ('FIRM', 'PROSPECT');
CREATE TYPE "ProductionCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

ALTER TABLE "Product" ADD COLUMN "validatedBatchSize" INTEGER;

ALTER TABLE "Customer" ADD COLUMN "defaultPriority" "ProductionPriority" NOT NULL DEFAULT 'NORMAL';

CREATE TABLE "ProductionCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ProductionCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductionCampaign_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProductionOrder" ADD COLUMN "customerId" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "orderKind" "ProductionOrderKind" NOT NULL DEFAULT 'FIRM';
ALTER TABLE "ProductionOrder" ADD COLUMN "scheduleDirection" "ProductionScheduleDirection" NOT NULL DEFAULT 'FORWARD';
ALTER TABLE "ProductionOrder" ADD COLUMN "earliestStartAt" TIMESTAMPTZ(6);
ALTER TABLE "ProductionOrder" ADD COLUMN "feasibleEndAt" TIMESTAMPTZ(6);
ALTER TABLE "ProductionOrder" ADD COLUMN "validatedBatchSize" INTEGER;
ALTER TABLE "ProductionOrder" ADD COLUMN "wholeBatchCount" INTEGER;
ALTER TABLE "ProductionOrder" ADD COLUMN "partialBatchRemainder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductionOrder" ADD COLUMN "reserveCapacity" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ProductionOrderAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionOrderAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionCampaign_tenantId_code_key" ON "ProductionCampaign"("tenantId", "code");
CREATE INDEX "ProductionCampaign_tenantId_productId_idx" ON "ProductionCampaign"("tenantId", "productId");

CREATE INDEX "ProductionOrder_tenantId_orderKind_idx" ON "ProductionOrder"("tenantId", "orderKind");
CREATE INDEX "ProductionOrder_customerId_idx" ON "ProductionOrder"("customerId");

CREATE INDEX "ProductionOrderAttachment_tenantId_productionOrderId_idx" ON "ProductionOrderAttachment"("tenantId", "productionOrderId");

ALTER TABLE "ProductionCampaign" ADD CONSTRAINT "ProductionCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionCampaign" ADD CONSTRAINT "ProductionCampaign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ProductionCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionOrderAttachment" ADD CONSTRAINT "ProductionOrderAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOrderAttachment" ADD CONSTRAINT "ProductionOrderAttachment_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
