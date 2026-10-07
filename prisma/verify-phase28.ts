import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  allowedActions,
  computeExecutionRisk,
  computeProgress,
  deriveExecutionState,
  validateProducedQuantity,
} from "../src/lib/production-execution/service";
import type { TenantContext } from "../src/lib/server/errors";
import { ServerError } from "../src/lib/server/errors";
import {
  completeProductionOrder,
  getProductionExecutionSnapshot,
  pauseProductionOrder,
  releaseProductionOrder,
  resolveProductionExecutionFilters,
  resumeProductionOrder,
  startProductionOrder,
} from "../src/lib/server/production-execution";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runPhase28Verify(prisma: PrismaClient) {
  const sources = [
    "src/lib/production-execution/service.ts",
    "src/lib/server/production-execution.ts",
    "src/components/execution/ProductionExecutionWorkspace.tsx",
    "src/app/(workspace)/execution/production/page.tsx",
  ]
    .map((path) => readFileSync(join(process.cwd(), path), "utf8"))
    .join("\n");
  assert(!/openai/i.test(sources), "Phase 28 performs ZERO OpenAI calls");
  assert(!/redis|kafka|bullmq|worker|cron/i.test(sources), "Phase 28 introduces no queue/worker infrastructure");

  const progress = computeProgress(8000, null);
  assert(progress.progressLabel === "Progress not recorded", "Missing produced qty is not fabricated");
  const progress2 = computeProgress(8000, 6400);
  assert(progress2.progressPercent === 80 && progress2.remainingQuantity === 1600, "Progress is produced/planned");

  assert(validateProducedQuantity(9000, 8000, true) !== null, "Complete rejects over-planned quantity");
  assert(validateProducedQuantity(8000, 8000, true) === null, "Complete allows planned quantity");

  const released = deriveExecutionState({
    planningStatus: "SCHEDULED",
    plannedStart: new Date(),
    plannedEnd: new Date(Date.now() + 3600000),
    workstationId: "ws",
    workstationActive: true,
    plannedQuantity: 100,
    producedQuantity: null,
    productionStartedAt: null,
    productionCompletedAt: null,
    history: [{ action: "PRODUCTION_RELEASE", createdAt: new Date() }],
  });
  assert(released === "RELEASED", "RELEASED derived from audit without schema change");

  const paused = deriveExecutionState({
    planningStatus: "IN_PROGRESS",
    plannedStart: new Date(),
    plannedEnd: new Date(Date.now() + 3600000),
    workstationId: "ws",
    workstationActive: true,
    plannedQuantity: 100,
    producedQuantity: null,
    productionStartedAt: new Date(),
    productionCompletedAt: null,
    history: [
      { action: "PRODUCTION_RELEASE", createdAt: new Date(Date.now() - 3000) },
      { action: "PRODUCTION_START", createdAt: new Date(Date.now() - 2000) },
      { action: "PRODUCTION_PAUSE", createdAt: new Date(Date.now() - 1000) },
    ],
  });
  assert(paused === "PAUSED", "PAUSED derived from audit overlay");
  assert(allowedActions("PAUSED").canResume && allowedActions("PAUSED").canComplete, "Paused can resume/complete");
  assert(!allowedActions("WAITING").canStart, "Waiting cannot start without release");

  const late = computeExecutionRisk({
    planningStatus: "IN_PROGRESS",
    plannedStart: new Date(Date.now() - 7200000),
    plannedEnd: new Date(Date.now() - 3600000),
    workstationId: "ws",
    workstationActive: true,
    plannedQuantity: 100,
    producedQuantity: null,
    productionStartedAt: new Date(Date.now() - 7000000),
    productionCompletedAt: null,
    history: [],
    executionState: "IN_PROGRESS",
    now: new Date(),
  });
  assert(late.risk === "LATE", "Past planned end is LATE");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "medicrest" } });
  const tenantB = await prisma.tenant.findUnique({ where: { slug: "tenant-b-isolation" } });
  assert(tenant && tenantB, "Demo tenants exist");

  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
  const product = await prisma.product.findFirst({ where: { tenantId: tenant.id } });
  const workstation = await prisma.workstation.findFirst({ where: { tenantId: tenant.id, active: true } });
  assert(user && product && workstation, "Demo user, product, and workstation exist");

  const ctxA: TenantContext = { tenantId: tenant.id, userId: user.id, role: "MANAGER" };
  const ctxViewer: TenantContext = { tenantId: tenant.id, userId: user.id, role: "VIEWER" };
  const ctxB: TenantContext = { tenantId: tenantB.id, userId: null, role: "MANAGER" };

  const snapshot = await getProductionExecutionSnapshot(ctxA, resolveProductionExecutionFilters({}));
  assert(snapshot.kpis.length === 5, "Execution metric strip");
  assert(snapshot.disclaimer.includes("do not consume materials"), "No auto inventory disclaimer");

  const order = await prisma.productionOrder.create({
    data: {
      tenantId: tenant.id,
      orderNumber: `PH28-${Date.now()}`,
      productId: product.id,
      workstationId: workstation.id,
      quantity: 1000,
      priority: "HIGH",
      status: "SCHEDULED",
      dueDate: new Date(Date.now() + 86400000 * 3),
      plannedStart: new Date(Date.now() + 3600000),
      plannedEnd: new Date(Date.now() + 7200000),
      durationMinutes: 60,
      isLocked: false,
    },
  });

  await prisma.productionBatch.create({
    data: {
      tenantId: tenant.id,
      productionOrderId: order.id,
      batchNumber: `PH28-B-${Date.now()}`,
      plannedQuantity: 1000,
      producedQuantity: null,
      qualityStatus: "PENDING_REVIEW",
    },
  });

  try {
    await releaseProductionOrder(ctxViewer, order.id);
    throw new Error("Viewer must not release");
  } catch (error) {
    assert(error instanceof ServerError && error.code === "FORBIDDEN", "Unauthorized mutation is FORBIDDEN");
  }

  const releasedResult = await releaseProductionOrder(ctxA, order.id);
  assert(releasedResult.executionState === "RELEASED", "Release succeeds");
  const releasedAgain = await releaseProductionOrder(ctxA, order.id);
  assert(releasedAgain.idempotent === true, "Duplicate release is idempotent");

  const locked = await prisma.productionOrder.findUnique({ where: { id: order.id } });
  assert(locked?.isLocked === true, "Release locks planning mutations");

  const started = await startProductionOrder(ctxA, order.id);
  assert(started.executionState === "IN_PROGRESS", "Start succeeds");
  const orderAfterStart = await prisma.productionOrder.findUnique({
    where: { id: order.id },
    include: { batch: true },
  });
  assert(orderAfterStart?.status === "IN_PROGRESS", "Start persists IN_PROGRESS");
  assert(orderAfterStart?.batch?.productionStartedAt != null, "Actual start timestamp persisted");

  try {
    await startProductionOrder(ctxA, order.id);
  } catch {
    throw new Error("Duplicate start should be idempotent");
  }
  const startedAgain = await startProductionOrder(ctxA, order.id);
  assert(startedAgain.idempotent === true, "Duplicate start is idempotent");

  const pausedResult = await pauseProductionOrder(ctxA, order.id);
  assert(pausedResult.executionState === "PAUSED", "Pause succeeds");
  const resumed = await resumeProductionOrder(ctxA, order.id);
  assert(resumed.executionState === "IN_PROGRESS", "Resume succeeds");

  try {
    await completeProductionOrder(ctxA, order.id, { producedQuantity: 1500 });
    throw new Error("Over-quantity complete must fail");
  } catch (error) {
    assert(error instanceof ServerError, "Over-quantity rejected");
  }

  const completed = await completeProductionOrder(ctxA, order.id, { producedQuantity: 950 });
  assert(completed.executionState === "COMPLETED", "Complete succeeds");
  const orderDone = await prisma.productionOrder.findUnique({
    where: { id: order.id },
    include: { batch: true },
  });
  assert(orderDone?.status === "COMPLETED", "Complete persists COMPLETED");
  assert(orderDone?.batch?.producedQuantity === 950, "Produced quantity persisted");
  assert(orderDone?.batch?.productionCompletedAt != null, "Actual completion timestamp persisted");

  const audits = await prisma.auditLog.findMany({
    where: {
      tenantId: tenant.id,
      entityType: "PRODUCTION_ORDER",
      entityId: order.id,
      action: { in: ["PRODUCTION_RELEASE", "PRODUCTION_START", "PRODUCTION_PAUSE", "PRODUCTION_RESUME", "PRODUCTION_COMPLETE"] },
    },
  });
  assert(audits.length >= 5, "Execution transitions audited");

  const foreign = await prisma.productionOrder.findFirst({ where: { tenantId: tenantB.id } });
  if (foreign) {
    try {
      await releaseProductionOrder(ctxA, foreign.id);
      throw new Error("Cross-tenant mutation must fail");
    } catch (error) {
      assert(error instanceof ServerError && error.code === "NOT_FOUND", "Tenant isolation on mutation");
    }
  }

  const snapshotB = await getProductionExecutionSnapshot(ctxB, resolveProductionExecutionFilters({})).catch(() => null);
  if (snapshotB) {
    assert(!snapshotB.orders.some((row) => row.id === order.id), "Tenant isolation on snapshot");
  }

  // Cleanup test artifacts
  await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id, entityId: order.id } });
  await prisma.productionBatch.deleteMany({ where: { productionOrderId: order.id } });
  await prisma.productionOrder.delete({ where: { id: order.id } });

  console.log("Phase 28 verification passed.");
}
