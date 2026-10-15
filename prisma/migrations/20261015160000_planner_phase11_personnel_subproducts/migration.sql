-- Phase 11 (SkyPlanner parity): personnel registry + sub-product links

CREATE TYPE "PlantEmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE');

CREATE TABLE "PlantEmployeeGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlantEmployeeGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantEmployee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PlantEmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlantEmployee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantEmployeeGroupMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "PlantEmployeeGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantEmployeeLeave" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,

    CONSTRAINT "PlantEmployeeLeave_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantEmployeeOperationSkill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "operationCode" TEXT NOT NULL,

    CONSTRAINT "PlantEmployeeOperationSkill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductSubAssembly" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentProductId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantityPerBatch" DECIMAL(18,6) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductSubAssembly_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlantEmployeeGroup_tenantId_code_key" ON "PlantEmployeeGroup"("tenantId", "code");
CREATE INDEX "PlantEmployeeGroup_tenantId_idx" ON "PlantEmployeeGroup"("tenantId");

CREATE UNIQUE INDEX "PlantEmployee_tenantId_code_key" ON "PlantEmployee"("tenantId", "code");
CREATE INDEX "PlantEmployee_tenantId_departmentId_idx" ON "PlantEmployee"("tenantId", "departmentId");
CREATE INDEX "PlantEmployee_tenantId_status_idx" ON "PlantEmployee"("tenantId", "status");

CREATE UNIQUE INDEX "PlantEmployeeGroupMember_groupId_employeeId_key" ON "PlantEmployeeGroupMember"("groupId", "employeeId");
CREATE INDEX "PlantEmployeeGroupMember_tenantId_employeeId_idx" ON "PlantEmployeeGroupMember"("tenantId", "employeeId");

CREATE INDEX "PlantEmployeeLeave_tenantId_employeeId_idx" ON "PlantEmployeeLeave"("tenantId", "employeeId");
CREATE INDEX "PlantEmployeeLeave_tenantId_startDate_endDate_idx" ON "PlantEmployeeLeave"("tenantId", "startDate", "endDate");

CREATE UNIQUE INDEX "PlantEmployeeOperationSkill_employeeId_operationCode_key" ON "PlantEmployeeOperationSkill"("employeeId", "operationCode");
CREATE INDEX "PlantEmployeeOperationSkill_tenantId_operationCode_idx" ON "PlantEmployeeOperationSkill"("tenantId", "operationCode");

CREATE UNIQUE INDEX "ProductSubAssembly_parentProductId_componentProductId_key" ON "ProductSubAssembly"("parentProductId", "componentProductId");
CREATE INDEX "ProductSubAssembly_tenantId_parentProductId_idx" ON "ProductSubAssembly"("tenantId", "parentProductId");

ALTER TABLE "PlantEmployeeGroup" ADD CONSTRAINT "PlantEmployeeGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlantEmployee" ADD CONSTRAINT "PlantEmployee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantEmployee" ADD CONSTRAINT "PlantEmployee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "PlantDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlantEmployeeGroupMember" ADD CONSTRAINT "PlantEmployeeGroupMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantEmployeeGroupMember" ADD CONSTRAINT "PlantEmployeeGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PlantEmployeeGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantEmployeeGroupMember" ADD CONSTRAINT "PlantEmployeeGroupMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PlantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlantEmployeeLeave" ADD CONSTRAINT "PlantEmployeeLeave_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantEmployeeLeave" ADD CONSTRAINT "PlantEmployeeLeave_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PlantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlantEmployeeOperationSkill" ADD CONSTRAINT "PlantEmployeeOperationSkill_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantEmployeeOperationSkill" ADD CONSTRAINT "PlantEmployeeOperationSkill_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PlantEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductSubAssembly" ADD CONSTRAINT "ProductSubAssembly_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSubAssembly" ADD CONSTRAINT "ProductSubAssembly_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSubAssembly" ADD CONSTRAINT "ProductSubAssembly_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
