-- CreateEnum
CREATE TYPE "ProductHazardClass" AS ENUM ('GENERAL', 'BETA_LACTAM');
CREATE TYPE "WorkstationDedicatedHazard" AS ENUM ('ANY', 'BETA_LACTAM', 'GENERAL_ONLY');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "hazardClass" "ProductHazardClass" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "Workstation" ADD COLUMN "dedicatedTo" "WorkstationDedicatedHazard" NOT NULL DEFAULT 'ANY';
