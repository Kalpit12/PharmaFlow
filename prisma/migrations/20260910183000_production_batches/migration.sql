-- CreateEnum
CREATE TYPE "BatchQualityStatus" AS ENUM ('PENDING_REVIEW', 'ON_HOLD', 'RELEASED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BatchQualityAction" AS ENUM ('HOLD', 'RELEASE', 'REJECT');

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "plannedQuantity" INTEGER NOT NULL,
    "producedQuantity" INTEGER,
    "qualityStatus" "BatchQualityStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "holdReason" TEXT,
    "reviewOwnerId" TEXT,
    "lastQualityAction" "BatchQualityAction",
    "lastQualityActionAt" TIMESTAMPTZ(6),
    "lastQualityActionById" TEXT,
    "productionStartedAt" TIMESTAMPTZ(6),
    "productionCompletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatchInputLot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "inventoryLotId" TEXT,
    "quantityUsed" INTEGER,

    CONSTRAINT "ProductionBatchInputLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatchQualityEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "action" "BatchQualityAction" NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionBatchQualityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_productionOrderId_key" ON "ProductionBatch"("productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_tenantId_batchNumber_key" ON "ProductionBatch"("tenantId", "batchNumber");

-- CreateIndex
CREATE INDEX "ProductionBatch_tenantId_idx" ON "ProductionBatch"("tenantId");

-- CreateIndex
CREATE INDEX "ProductionBatch_tenantId_qualityStatus_idx" ON "ProductionBatch"("tenantId", "qualityStatus");

-- CreateIndex
CREATE INDEX "ProductionBatch_tenantId_updatedAt_idx" ON "ProductionBatch"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "ProductionBatchInputLot_tenantId_batchId_idx" ON "ProductionBatchInputLot"("tenantId", "batchId");

-- CreateIndex
CREATE INDEX "ProductionBatchInputLot_productId_idx" ON "ProductionBatchInputLot"("productId");

-- CreateIndex
CREATE INDEX "ProductionBatchQualityEvent_tenantId_batchId_idx" ON "ProductionBatchQualityEvent"("tenantId", "batchId");

-- CreateIndex
CREATE INDEX "ProductionBatchQualityEvent_tenantId_createdAt_idx" ON "ProductionBatchQualityEvent"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_reviewOwnerId_fkey" FOREIGN KEY ("reviewOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_lastQualityActionById_fkey" FOREIGN KEY ("lastQualityActionById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatchInputLot" ADD CONSTRAINT "ProductionBatchInputLot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatchInputLot" ADD CONSTRAINT "ProductionBatchInputLot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatchInputLot" ADD CONSTRAINT "ProductionBatchInputLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatchInputLot" ADD CONSTRAINT "ProductionBatchInputLot_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatchQualityEvent" ADD CONSTRAINT "ProductionBatchQualityEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatchQualityEvent" ADD CONSTRAINT "ProductionBatchQualityEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatchQualityEvent" ADD CONSTRAINT "ProductionBatchQualityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
