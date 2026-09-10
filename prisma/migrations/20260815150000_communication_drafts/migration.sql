-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('CUSTOMER_FOLLOW_UP', 'RFQ_FOLLOW_UP', 'SALES_OPPORTUNITY_FOLLOW_UP', 'CUSTOMER_REENGAGEMENT');

-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('DRAFT', 'REVIEWED', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "CommunicationDraft" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "CommunicationType" NOT NULL,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "workflowId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewedAt" TIMESTAMPTZ(6),
    "approvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CommunicationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationDraft_tenantId_status_idx" ON "CommunicationDraft"("tenantId", "status");
CREATE INDEX "CommunicationDraft_tenantId_createdAt_idx" ON "CommunicationDraft"("tenantId", "createdAt");
CREATE INDEX "CommunicationDraft_tenantId_customerId_idx" ON "CommunicationDraft"("tenantId", "customerId");

-- AddForeignKey
ALTER TABLE "CommunicationDraft" ADD CONSTRAINT "CommunicationDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationDraft" ADD CONSTRAINT "CommunicationDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunicationDraft" ADD CONSTRAINT "CommunicationDraft_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunicationDraft" ADD CONSTRAINT "CommunicationDraft_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunicationDraft" ADD CONSTRAINT "CommunicationDraft_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
