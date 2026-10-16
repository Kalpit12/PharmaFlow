CREATE TABLE "WorkstationRosterAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workstationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "employeeId" TEXT,
    "shiftLabel" TEXT,

    CONSTRAINT "WorkstationRosterAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkstationRosterAssignment_workstationId_date_startMinute_key" ON "WorkstationRosterAssignment"("workstationId", "date", "startMinute");
CREATE INDEX "WorkstationRosterAssignment_tenantId_date_idx" ON "WorkstationRosterAssignment"("tenantId", "date");
CREATE INDEX "WorkstationRosterAssignment_tenantId_workstationId_idx" ON "WorkstationRosterAssignment"("tenantId", "workstationId");

ALTER TABLE "WorkstationRosterAssignment" ADD CONSTRAINT "WorkstationRosterAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkstationRosterAssignment" ADD CONSTRAINT "WorkstationRosterAssignment_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkstationRosterAssignment" ADD CONSTRAINT "WorkstationRosterAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PlantEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
