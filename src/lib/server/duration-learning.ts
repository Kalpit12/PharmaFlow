import { can, requirePermission } from "@/lib/auth/authorization";
import {
  DURATION_LEARNING_RULES,
  buildDurationSuggestions,
  type DurationSuggestion,
} from "@/lib/operations/duration-learning";
import { isQaHoldOperation } from "@/lib/operations/elapsed-workstation";
import { writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";

export type DurationLearningSnapshot = {
  asOf: string;
  lookbackDays: number;
  minSamples: number;
  completedOperations: number;
  suggestions: Array<DurationSuggestion & { workstationNames: Record<string, string> }>;
  canAccept: boolean;
};

/** Completed steps with shop-floor timelogs in the look-back window → suggested run times. */
export async function getDurationLearningSnapshot(ctx: TenantContext): Promise<DurationLearningSnapshot> {
  requirePermission(ctx, "production.read");
  const prisma = getPrisma();
  const since = new Date(Date.now() - DURATION_LEARNING_RULES.lookbackDays * 86_400_000);
  const operations = await prisma.productionOperation.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "COMPLETED",
      routingOperationId: { not: null },
      actualEnd: { gte: since },
    },
    select: {
      id: true,
      routingOperationId: true,
      workstationId: true,
      durationMinutes: true,
      operationCode: true,
      shopFloorEvents: {
        where: { eventType: { in: ["START", "PAUSE", "RESUME", "STOP"] } },
        select: { eventType: true, recordedAt: true },
      },
    },
  });
  const stepIds = [...new Set(operations.map((row) => row.routingOperationId!))];
  const steps =
    stepIds.length === 0
      ? []
      : await prisma.routingOperation.findMany({
          where: { tenantId: ctx.tenantId, id: { in: stepIds } },
          select: {
            id: true,
            code: true,
            name: true,
            runMinutesPerBatch: true,
            isQcHold: true,
            routing: { select: { product: { select: { name: true } } } },
          },
        });
  const suggestions = buildDurationSuggestions(
    operations.map((row) => ({
      operationId: row.id,
      routingOperationId: row.routingOperationId!,
      workstationId: row.workstationId,
      plannedMinutes: row.durationMinutes,
      events: row.shopFloorEvents,
    })),
    steps.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      productName: row.routing.product.name,
      runMinutesPerBatch: row.runMinutesPerBatch,
      isQcHold: row.isQcHold || isQaHoldOperation(row.code),
    }))
  );
  const wsIds = [...new Set(suggestions.flatMap((row) => row.byWorkstation.map((ws) => ws.workstationId)).filter(Boolean))] as string[];
  const workstations =
    wsIds.length === 0
      ? []
      : await prisma.workstation.findMany({ where: { tenantId: ctx.tenantId, id: { in: wsIds } }, select: { id: true, name: true } });
  const names = Object.fromEntries(workstations.map((row) => [row.id, row.name]));
  return {
    asOf: new Date().toISOString(),
    lookbackDays: DURATION_LEARNING_RULES.lookbackDays,
    minSamples: DURATION_LEARNING_RULES.minSamples,
    completedOperations: operations.length,
    suggestions: suggestions.map((row) => ({ ...row, workstationNames: names })),
    canAccept: can(ctx.role, "production.global_rules"),
  };
}

/**
 * Head planner accepts a suggestion: update the routing step's run time (future jobs only).
 * The value must match the current suggestion so a stale screen cannot write an old number.
 */
export async function acceptDurationSuggestion(
  ctx: TenantContext,
  input: { routingOperationId: string; suggestedRunMinutes: number; reason?: string }
) {
  requirePermission(ctx, "production.global_rules");
  const snapshot = await getDurationLearningSnapshot(ctx);
  const suggestion = snapshot.suggestions.find((row) => row.routingOperationId === input.routingOperationId);
  if (!suggestion) throw new ServerError("This suggestion is no longer current. Refresh the list.", "CONFLICT");
  if (suggestion.suggestedRunMinutes !== Math.round(input.suggestedRunMinutes)) {
    throw new ServerError("The suggested value changed since you opened the list. Refresh and review again.", "CONFLICT");
  }
  const prisma = getPrisma();
  const step = await prisma.routingOperation.findFirst({
    where: { id: input.routingOperationId, tenantId: ctx.tenantId },
    select: { id: true, code: true, runMinutesPerBatch: true },
  });
  if (!step) throw new ServerError("Routing step not found.", "NOT_FOUND");
  await prisma.routingOperation.update({
    where: { id: step.id },
    data: { runMinutesPerBatch: suggestion.suggestedRunMinutes },
  });
  await writeAuditLog(ctx, {
    action: "ROUTING_DURATION_LEARNED",
    entityType: "ROUTING_OPERATION",
    entityId: step.id,
    oldValue: `RUN_MINUTES: ${step.runMinutesPerBatch}`,
    newValue: `RUN_MINUTES: ${suggestion.suggestedRunMinutes}`,
    reason:
      input.reason?.trim() ||
      `Accepted from ${suggestion.sampleCount} timelogs (median ×${suggestion.medianRatio}) for ${suggestion.productName} ${step.code}`,
  });
  return {
    routingOperationId: step.id,
    previousRunMinutes: step.runMinutesPerBatch,
    runMinutesPerBatch: suggestion.suggestedRunMinutes,
    message: "Run time updated. New orders use it; jobs already planned keep their current duration.",
  };
}
