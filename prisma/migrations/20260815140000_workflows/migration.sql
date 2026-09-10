-- CreateEnum
CREATE TYPE "WorkflowType" AS ENUM ('RFQ_FOLLOW_UP', 'CUSTOMER_REENGAGEMENT', 'SALES_OPPORTUNITY_FOLLOW_UP');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('PROPOSED', 'PENDING_APPROVAL', 'RUNNING', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "type" "WorkflowType" NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "failureReason" TEXT,
    "proposedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "failedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Action" ADD COLUMN "workflowId" TEXT;

-- CreateIndex
CREATE INDEX "Workflow_tenantId_idx" ON "Workflow"("tenantId");
CREATE INDEX "Workflow_tenantId_status_idx" ON "Workflow"("tenantId", "status");
CREATE INDEX "Workflow_tenantId_createdAt_idx" ON "Workflow"("tenantId", "createdAt");
CREATE INDEX "Action_workflowId_idx" ON "Action"("workflowId");

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Action" ADD CONSTRAINT "Action_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
