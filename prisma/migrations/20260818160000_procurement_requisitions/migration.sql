-- CreateEnum
CREATE TYPE "ProcurementRequisitionStatus" AS ENUM ('DRAFT', 'REVIEWED', 'REJECTED');

-- CreateTable
CREATE TABLE "ProcurementRequisition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "status" "ProcurementRequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "materialSku" TEXT NOT NULL,
    "materialName" TEXT NOT NULL,
    "materialUnit" TEXT NOT NULL,
    "grossRequirement" DECIMAL(18,3) NOT NULL,
    "available" INTEGER NOT NULL,
    "incoming" INTEGER NOT NULL,
    "projectedAvailable" DECIMAL(18,3) NOT NULL,
    "netRequirement" INTEGER NOT NULL,
    "earliestDueDate" TIMESTAMPTZ(6),
    "affectedOrders" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(6),
    "rejectedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProcurementRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcurementRequisition_tenantId_status_idx" ON "ProcurementRequisition"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProcurementRequisition_tenantId_productId_idx" ON "ProcurementRequisition"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "ProcurementRequisition_tenantId_createdAt_idx" ON "ProcurementRequisition"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProcurementRequisition" ADD CONSTRAINT "ProcurementRequisition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequisition" ADD CONSTRAINT "ProcurementRequisition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequisition" ADD CONSTRAINT "ProcurementRequisition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequisition" ADD CONSTRAINT "ProcurementRequisition_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
