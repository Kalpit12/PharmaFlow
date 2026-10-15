-- Phase 9: tenant API keys, outbound planner webhooks, delivery log

CREATE TYPE "PlannerWebhookEventType" AS ENUM (
  'SCHEDULE_PLAN_ACCEPTED',
  'PRODUCTION_JOB_STARTED',
  'PRODUCTION_JOB_COMPLETED',
  'PRODUCTION_ORDER_LATE',
  'BATCH_MATERIAL_DELAYED'
);

CREATE TABLE "TenantApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TenantApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlannerWebhookSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "endpointUrl" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlannerWebhookSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlannerWebhookDeliveryLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responseCode" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannerWebhookDeliveryLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantApiKey_keyHash_key" ON "TenantApiKey"("keyHash");
CREATE INDEX "TenantApiKey_tenantId_active_idx" ON "TenantApiKey"("tenantId", "active");
CREATE INDEX "PlannerWebhookSubscription_tenantId_active_idx" ON "PlannerWebhookSubscription"("tenantId", "active");
CREATE INDEX "PlannerWebhookDeliveryLog_tenantId_createdAt_idx" ON "PlannerWebhookDeliveryLog"("tenantId", "createdAt");
CREATE INDEX "PlannerWebhookDeliveryLog_subscriptionId_idx" ON "PlannerWebhookDeliveryLog"("subscriptionId");

ALTER TABLE "TenantApiKey" ADD CONSTRAINT "TenantApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannerWebhookSubscription" ADD CONSTRAINT "PlannerWebhookSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannerWebhookDeliveryLog" ADD CONSTRAINT "PlannerWebhookDeliveryLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannerWebhookDeliveryLog" ADD CONSTRAINT "PlannerWebhookDeliveryLog_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PlannerWebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
