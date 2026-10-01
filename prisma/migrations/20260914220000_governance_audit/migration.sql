-- Phase 36: extend roles and add audit trail

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OPERATIONS';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PROCUREMENT';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'QUALITY';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SALES';

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt" DESC);
CREATE INDEX "audit_logs_tenantId_entityType_entityId_idx" ON "audit_logs"("tenantId", "entityType", "entityId");
CREATE INDEX "audit_logs_tenantId_actorUserId_idx" ON "audit_logs"("tenantId", "actorUserId");

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
