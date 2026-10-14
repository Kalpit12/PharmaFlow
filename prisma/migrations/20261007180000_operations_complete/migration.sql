-- Global optimizer flag, integration connectors, shop-floor planning events

ALTER TYPE "PlanningEventType" ADD VALUE 'SHOP_FLOOR_TRIGGERED';

CREATE TYPE "IntegrationConnectorType" AS ENUM ('SAP_B1', 'MES_SHOP_FLOOR');
CREATE TYPE "IntegrationConnectorStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR');
CREATE TYPE "IntegrationSyncDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "IntegrationSyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

ALTER TABLE "PlanningPolicy" ADD COLUMN "useGlobalOptimizer" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "IntegrationConnector" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "IntegrationConnectorType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IntegrationConnectorStatus" NOT NULL DEFAULT 'ACTIVE',
    "endpointUrl" TEXT,
    "webhookSecret" TEXT,
    "lastSyncAt" TIMESTAMPTZ(6),
    "lastSyncStatus" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "IntegrationConnector_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationSyncRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "direction" "IntegrationSyncDirection" NOT NULL,
    "status" "IntegrationSyncStatus" NOT NULL,
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "IntegrationSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationWebhookDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "processedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConnector_tenantId_type_key" ON "IntegrationConnector"("tenantId", "type");
CREATE INDEX "IntegrationSyncRun_tenantId_connectorId_idx" ON "IntegrationSyncRun"("tenantId", "connectorId");
CREATE UNIQUE INDEX "IntegrationWebhookDelivery_tenantId_connectorId_idempotencyKey_key" ON "IntegrationWebhookDelivery"("tenantId", "connectorId", "idempotencyKey");

ALTER TABLE "IntegrationConnector" ADD CONSTRAINT "IntegrationConnector_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationSyncRun" ADD CONSTRAINT "IntegrationSyncRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationSyncRun" ADD CONSTRAINT "IntegrationSyncRun_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "IntegrationConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationWebhookDelivery" ADD CONSTRAINT "IntegrationWebhookDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationWebhookDelivery" ADD CONSTRAINT "IntegrationWebhookDelivery_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "IntegrationConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
