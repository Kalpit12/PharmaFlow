import { requirePermission } from "@/lib/auth/authorization";
import { buildStandardPlantShiftRows } from "@/lib/operations/plant-shift-template";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";

export async function markWorkstationScheduleStale(ctx: TenantContext, summary: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.planningEvent.create({
    data: {
      tenantId: ctx.tenantId,
      eventType: "IMPORTED",
      summary,
      actorId: ctx.userId,
    },
  });
}

export async function getWorkstationSettings(ctx: TenantContext, workstationId: string) {
  requirePermission(ctx, "production.read");
  const prisma = getPrisma();
  const row = await prisma.workstation.findFirst({
    where: { id: workstationId, tenantId: ctx.tenantId },
    include: {
      site: { select: { id: true, code: true, name: true } },
      group: { select: { id: true, code: true, name: true } },
      shifts: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
      calendarExceptions: { orderBy: { date: "desc" }, take: 24 },
      routingResources: {
        include: {
          routingOperation: {
            select: {
              code: true,
              name: true,
              routing: { select: { product: { select: { sku: true, name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!row) throw new ServerError("Workstation not found.", "NOT_FOUND");

  const auditLogs = await prisma.auditLog.findMany({
    where: { tenantId: ctx.tenantId, entityType: "Workstation", entityId: workstationId },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { actor: { select: { name: true } } },
  });

  const routingSteps = row.routingResources.map((link) => ({
    id: link.id,
    operationCode: link.routingOperation.code,
    operationName: link.routingOperation.name,
    productSku: link.routingOperation.routing.product.sku,
    productName: link.routingOperation.routing.product.name,
    eligible: true,
  }));

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    active: row.active,
    site: row.site,
    group: row.group,
    allowedParallelJobs: row.allowedParallelJobs,
    efficiencyCoefficient: Number(row.efficiencyCoefficient),
    dedicatedTo: row.dedicatedTo,
    capacityHoursPerDay: row.capacityHoursPerDay,
    qualificationStatus: row.qualificationStatus,
    calibrationDueDate: row.calibrationDueDate?.toISOString().slice(0, 10) ?? null,
    cleanStatus: row.cleanStatus,
    cleanHoldExpiresAt: row.cleanHoldExpiresAt?.toISOString() ?? null,
    shifts: row.shifts,
    exceptions: row.calendarExceptions.map((ex) => ({
      id: ex.id,
      date: ex.date.toISOString().slice(0, 10),
      reason: ex.reason,
      closed: ex.closed,
    })),
    routingSteps,
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      at: log.createdAt.toISOString(),
      actor: log.actor?.name ?? "System",
      action: log.action,
      detail: log.reason ?? log.newValue ?? log.oldValue ?? "",
    })),
  };
}

export type WorkstationSettingsPatch = {
  name?: string;
  active?: boolean;
  allowedParallelJobs?: number;
  efficiencyCoefficient?: number;
  dedicatedTo?: "ANY" | "GENERAL_ONLY" | "BETA_LACTAM";
  qualificationStatus?: "QUALIFIED" | "DUE" | "EXPIRED";
  calibrationDueDate?: string | null;
  cleanStatus?: "CLEAN" | "DIRTY";
};

export async function patchWorkstationSettings(
  ctx: TenantContext,
  workstationId: string,
  patch: WorkstationSettingsPatch
): Promise<void> {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const existing = await prisma.workstation.findFirst({
    where: { id: workstationId, tenantId: ctx.tenantId },
    select: { id: true, code: true, name: true },
  });
  if (!existing) throw new ServerError("Workstation not found.", "NOT_FOUND");

  await prisma.workstation.update({
    where: { id: workstationId },
    data: {
      name: patch.name,
      active: patch.active,
      allowedParallelJobs: patch.allowedParallelJobs,
      efficiencyCoefficient: patch.efficiencyCoefficient,
      dedicatedTo: patch.dedicatedTo,
      qualificationStatus: patch.qualificationStatus,
      calibrationDueDate: patch.calibrationDueDate ? new Date(patch.calibrationDueDate) : undefined,
      cleanStatus: patch.cleanStatus,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      entityType: "Workstation",
      entityId: workstationId,
      action: "UPDATE",
      reason: `Updated workstation ${existing.code}`,
      actorUserId: ctx.userId,
    },
  });

  await markWorkstationScheduleStale(ctx, `WORKSTATION_UPDATED ${existing.code}`);
}

/** Re-apply standard plant shift rows after template edits (demo helper). */
export async function replaceWorkstationShiftTemplate(
  ctx: TenantContext,
  workstationId: string,
  mode: "plant" | "qc24"
): Promise<void> {
  requirePermission(ctx, "production.schedule");
  const prisma = getPrisma();
  const rows =
    mode === "qc24"
      ? [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startMinute: 0,
          endMinute: 1_440,
        }))
      : buildStandardPlantShiftRows([1, 2, 3, 4, 5, 6]);

  await prisma.workstationShift.deleteMany({ where: { workstationId, tenantId: ctx.tenantId } });
  await prisma.workstationShift.createMany({
    data: rows.map((row) => ({ tenantId: ctx.tenantId, workstationId, ...row })),
  });
  await markWorkstationScheduleStale(ctx, `WORKSTATION_SHIFTS ${workstationId}`);
}
