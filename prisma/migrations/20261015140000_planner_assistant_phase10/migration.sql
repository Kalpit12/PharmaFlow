-- Phase 10: planner assistant drafts (propose → accept)

CREATE TYPE "PlannerAssistantDraftStatus" AS ENUM ('DRAFT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

CREATE TABLE "PlannerAssistantDraft" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PlannerAssistantDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "decidedAt" TIMESTAMPTZ(6),

    CONSTRAINT "PlannerAssistantDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlannerAssistantDraft_tenantId_userId_status_idx" ON "PlannerAssistantDraft"("tenantId", "userId", "status");
CREATE INDEX "PlannerAssistantDraft_tenantId_createdAt_idx" ON "PlannerAssistantDraft"("tenantId", "createdAt");

ALTER TABLE "PlannerAssistantDraft" ADD CONSTRAINT "PlannerAssistantDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannerAssistantDraft" ADD CONSTRAINT "PlannerAssistantDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
