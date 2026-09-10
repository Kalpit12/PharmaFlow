-- CreateEnum
CREATE TYPE "ProductionPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('UNSCHEDULED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'AT_RISK');

-- CreateTable
CREATE TABLE "Workstation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacityHoursPerDay" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Workstation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "workstationId" TEXT,
    "quantity" INTEGER NOT NULL,
    "priority" "ProductionPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'UNSCHEDULED',
    "dueDate" TIMESTAMPTZ(6) NOT NULL,
    "plannedStart" TIMESTAMPTZ(6),
    "plannedEnd" TIMESTAMPTZ(6),
    "durationMinutes" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workstation_tenantId_code_key" ON "Workstation"("tenantId", "code");
CREATE INDEX "Workstation_tenantId_idx" ON "Workstation"("tenantId");
CREATE INDEX "Workstation_tenantId_active_idx" ON "Workstation"("tenantId", "active");
CREATE UNIQUE INDEX "ProductionOrder_tenantId_orderNumber_key" ON "ProductionOrder"("tenantId", "orderNumber");
CREATE INDEX "ProductionOrder_tenantId_idx" ON "ProductionOrder"("tenantId");
CREATE INDEX "ProductionOrder_tenantId_status_idx" ON "ProductionOrder"("tenantId", "status");
CREATE INDEX "ProductionOrder_tenantId_dueDate_idx" ON "ProductionOrder"("tenantId", "dueDate");
CREATE INDEX "ProductionOrder_workstationId_idx" ON "ProductionOrder"("workstationId");

-- AddForeignKey
ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
