-- CreateEnum
CREATE TYPE "ProcurementRfqStatus" AS ENUM ('DRAFT', 'REVIEW', 'READY', 'RESPONSES', 'EVALUATION', 'AWARDED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProcurementRfqSupplierStatus" AS ENUM ('INVITED', 'RESPONDED', 'DECLINED', 'AWARDED');

-- CreateEnum
CREATE TYPE "ProcurementRfqResponseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AWARDED', 'REJECTED');

-- CreateTable
CREATE TABLE "procurement_rfqs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProcurementRfqStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "dueDate" TIMESTAMPTZ(6),
    "notes" TEXT,
    "procurementRequisitionId" TEXT,
    "awardedResponseId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "procurement_rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_rfq_items" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "procurement_rfq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_rfq_suppliers" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "ProcurementRfqSupplierStatus" NOT NULL DEFAULT 'INVITED',

    CONSTRAINT "procurement_rfq_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_rfq_responses" (
    "id" TEXT NOT NULL,
    "rfqSupplierId" TEXT NOT NULL,
    "responseStatus" "ProcurementRfqResponseStatus" NOT NULL DEFAULT 'DRAFT',
    "quotedAt" TIMESTAMPTZ(6),
    "currency" CHAR(3),
    "totalAmount" DECIMAL(18,2),
    "leadTimeDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "procurement_rfq_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_rfq_response_items" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "rfqItemId" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2),
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "procurement_rfq_response_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "procurement_rfqs_awardedResponseId_key" ON "procurement_rfqs"("awardedResponseId");

-- CreateIndex
CREATE INDEX "procurement_rfqs_tenantId_status_idx" ON "procurement_rfqs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "procurement_rfqs_tenantId_createdAt_idx" ON "procurement_rfqs"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_rfqs_tenantId_reference_key" ON "procurement_rfqs"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "procurement_rfq_items_rfqId_idx" ON "procurement_rfq_items"("rfqId");

-- CreateIndex
CREATE INDEX "procurement_rfq_items_productId_idx" ON "procurement_rfq_items"("productId");

-- CreateIndex
CREATE INDEX "procurement_rfq_suppliers_rfqId_idx" ON "procurement_rfq_suppliers"("rfqId");

-- CreateIndex
CREATE INDEX "procurement_rfq_suppliers_supplierId_idx" ON "procurement_rfq_suppliers"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_rfq_suppliers_rfqId_supplierId_key" ON "procurement_rfq_suppliers"("rfqId", "supplierId");

-- CreateIndex
CREATE INDEX "procurement_rfq_responses_rfqSupplierId_idx" ON "procurement_rfq_responses"("rfqSupplierId");

-- CreateIndex
CREATE INDEX "procurement_rfq_response_items_responseId_idx" ON "procurement_rfq_response_items"("responseId");

-- CreateIndex
CREATE INDEX "procurement_rfq_response_items_rfqItemId_idx" ON "procurement_rfq_response_items"("rfqItemId");

-- AddForeignKey
ALTER TABLE "procurement_rfqs" ADD CONSTRAINT "procurement_rfqs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_rfqs" ADD CONSTRAINT "procurement_rfqs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_rfqs" ADD CONSTRAINT "procurement_rfqs_procurementRequisitionId_fkey" FOREIGN KEY ("procurementRequisitionId") REFERENCES "ProcurementRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_rfqs" ADD CONSTRAINT "procurement_rfqs_awardedResponseId_fkey" FOREIGN KEY ("awardedResponseId") REFERENCES "procurement_rfq_responses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_rfq_items" ADD CONSTRAINT "procurement_rfq_items_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "procurement_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_rfq_items" ADD CONSTRAINT "procurement_rfq_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_rfq_suppliers" ADD CONSTRAINT "procurement_rfq_suppliers_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "procurement_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_rfq_suppliers" ADD CONSTRAINT "procurement_rfq_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_rfq_responses" ADD CONSTRAINT "procurement_rfq_responses_rfqSupplierId_fkey" FOREIGN KEY ("rfqSupplierId") REFERENCES "procurement_rfq_suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_rfq_response_items" ADD CONSTRAINT "procurement_rfq_response_items_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "procurement_rfq_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_rfq_response_items" ADD CONSTRAINT "procurement_rfq_response_items_rfqItemId_fkey" FOREIGN KEY ("rfqItemId") REFERENCES "procurement_rfq_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
