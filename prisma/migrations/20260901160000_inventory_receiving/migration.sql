-- Phase 24: Inventory receiving from approved purchase orders

ALTER TABLE "purchase_order_items" ADD COLUMN "receivedQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "InventoryReceipt" ADD COLUMN "purchaseOrderId" TEXT;
ALTER TABLE "InventoryReceipt" ADD COLUMN "purchaseOrderItemId" TEXT;
ALTER TABLE "InventoryReceipt" ADD COLUMN "inventoryLotId" TEXT;
ALTER TABLE "InventoryReceipt" ADD COLUMN "receivedById" TEXT;
ALTER TABLE "InventoryReceipt" ADD COLUMN "receivedAt" TIMESTAMPTZ(6);
ALTER TABLE "InventoryReceipt" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "InventoryReceipt" ADD COLUMN "discrepancyReason" TEXT;
ALTER TABLE "InventoryReceipt" ADD COLUMN "notes" TEXT;

CREATE UNIQUE INDEX "InventoryReceipt_inventoryLotId_key" ON "InventoryReceipt"("inventoryLotId");
CREATE UNIQUE INDEX "InventoryReceipt_tenantId_idempotencyKey_key" ON "InventoryReceipt"("tenantId", "idempotencyKey");
CREATE INDEX "InventoryReceipt_purchaseOrderId_idx" ON "InventoryReceipt"("purchaseOrderId");

ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
