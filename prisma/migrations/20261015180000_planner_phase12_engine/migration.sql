-- Phase 12: SkyPlanner engine mechanics — extended global rules + fast track flag

ALTER TABLE "PlanningPolicy" ADD COLUMN IF NOT EXISTS "leadTimeWeight" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "PlanningPolicy" ADD COLUMN IF NOT EXISTS "onTimeCountWeight" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "PlanningPolicy" ADD COLUMN IF NOT EXISTS "customerPriorityWeight" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "PlanningPolicy" ADD COLUMN IF NOT EXISTS "similarJobsWeight" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "PlanningPolicy" ADD COLUMN IF NOT EXISTS "eligibilityWeight" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "PlanningPolicy" ADD COLUMN IF NOT EXISTS "considerMaterials" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PlanningPolicy" ADD COLUMN IF NOT EXISTS "considerEligibility" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ProductionOrder" ADD COLUMN IF NOT EXISTS "fastTrack" BOOLEAN NOT NULL DEFAULT false;
