-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('OPEN', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "supplierId" TEXT,
    "reference" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'OPEN',
    "expectedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "InventoryReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillOfMaterial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantityPer" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "BillOfMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "class" "InventoryClass" NOT NULL,
    "capturedOn" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "InventorySnapshot_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "InventoryLot" ADD COLUMN "supplierId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_code_key" ON "Supplier"("tenantId", "code");
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");
CREATE UNIQUE INDEX "InventoryReceipt_tenantId_reference_key" ON "InventoryReceipt"("tenantId", "reference");
CREATE INDEX "InventoryReceipt_tenantId_status_idx" ON "InventoryReceipt"("tenantId", "status");
CREATE INDEX "InventoryReceipt_productId_idx" ON "InventoryReceipt"("productId");
CREATE UNIQUE INDEX "BillOfMaterial_tenantId_productId_componentId_key" ON "BillOfMaterial"("tenantId", "productId", "componentId");
CREATE INDEX "BillOfMaterial_tenantId_idx" ON "BillOfMaterial"("tenantId");
CREATE INDEX "BillOfMaterial_productId_idx" ON "BillOfMaterial"("productId");
CREATE INDEX "BillOfMaterial_componentId_idx" ON "BillOfMaterial"("componentId");
CREATE UNIQUE INDEX "InventorySnapshot_tenantId_capturedOn_productId_key" ON "InventorySnapshot"("tenantId", "capturedOn", "productId");
CREATE INDEX "InventorySnapshot_tenantId_capturedOn_idx" ON "InventorySnapshot"("tenantId", "capturedOn");
CREATE INDEX "InventoryLot_supplierId_idx" ON "InventoryLot"("supplierId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillOfMaterial" ADD CONSTRAINT "BillOfMaterial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillOfMaterial" ADD CONSTRAINT "BillOfMaterial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillOfMaterial" ADD CONSTRAINT "BillOfMaterial_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
