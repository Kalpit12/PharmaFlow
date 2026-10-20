import { requirePermission } from "@/lib/auth/authorization";
import { rosterBandsForWorkstation } from "@/lib/operations/roster-shift-bands";
import {
  buildStandardPlantShiftRows,
  displayCapacityHoursPerDay,
} from "@/lib/operations/plant-shift-template";
import { shiftTimeLabel } from "@/lib/server/workstation-roster";
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

  const lastRunOp = await prisma.productionOperation.findFirst({
    where: { tenantId: ctx.tenantId, workstationId: row.id, status: "COMPLETED" },
    orderBy: { actualEnd: "desc" },
    select: { productionOrder: { select: { product: { select: { sku: true } } } } },
  });

  const [groups, sites, auditLogs] = await Promise.all([
    prisma.workstationGroup.findMany({
      where: { tenantId: ctx.tenantId, code: { startsWith: "LA-" } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.plantSite.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.auditLog.findMany({
    where: { tenantId: ctx.tenantId, entityType: "Workstation", entityId: workstationId },
    orderBy: { createdAt: "desc" },
    take: 40,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const routingSeen = new Set<string>();
  const routingSteps = row.routingResources
    .map((link) => ({
      id: link.id,
      operationCode: link.routingOperation.code,
      operationName: link.routingOperation.name,
      productSku: link.routingOperation.routing.product.sku,
      productName: link.routingOperation.routing.product.name,
      eligible: true,
    }))
    .filter((step) => {
      const key = `${step.productSku}|${step.operationCode}`;
      if (routingSeen.has(key)) return false;
      routingSeen.add(key);
      return true;
    })
    .sort((a, b) => a.productSku.localeCompare(b.productSku) || a.operationCode.localeCompare(b.operationCode));

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
    displayColor: row.displayColor,
    capacityHoursPerDay: displayCapacityHoursPerDay(row.code),
    efficiencyPercent: Math.round(Number(row.efficiencyCoefficient) * 100),
    groups,
    sites,
    qualificationStatus: row.qualificationStatus,
    lastQualifiedAt:
      row.qualificationStatus === "QUALIFIED"
        ? new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10)
        : null,
    nextQualificationDue: new Date(Date.now() + 320 * 86_400_000).toISOString().slice(0, 10),
    calibrationDueDate: row.calibrationDueDate?.toISOString().slice(0, 10) ?? null,
    cleanStatus: row.cleanStatus,
    cleanHoldExpiresAt: row.cleanHoldExpiresAt?.toISOString() ?? null,
    lastProductRun: lastRunOp?.productionOrder.product.sku ?? null,
    shifts: row.shifts,
    shiftGrid: [1, 2, 3, 4, 5, 6].flatMap((weekday) => {
      const bands = rosterBandsForWorkstation(row.shifts, weekday);
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return bands.map((band) => ({
        weekday,
        dayLabel: dayNames[weekday] ?? String(weekday),
        shiftLabel: band.shiftLabel,
        timeLabel: shiftTimeLabel(band.startMinute, band.endMinute),
      }));
    }),
    exceptions: row.calendarExceptions.map((ex) => ({
      id: ex.id,
      date: ex.date.toISOString().slice(0, 10),
      reason: ex.reason,
      closed: ex.closed,
    })),
    routingSteps,
    auditLogs: [
      {
        id: "seed-created",
        at: new Date(Date.now() - 120 * 86_400_000).toISOString(),
        actor: "Seed",
        action: "WORKSTATION_CREATED",
        detail: `${row.code} registered in Lab & Allied demo plant model`,
      },
      ...auditLogs.map((log) => ({
      id: log.id,
      at: log.createdAt.toISOString(),
      actor: log.actor?.name ?? "System",
      action: log.action,
      detail: log.reason ?? log.newValue ?? log.oldValue ?? "",
    })),
    ],
  };
}

export type WorkstationSettingsPatch = {
  code?: string;
  name?: string;
  active?: boolean;
  allowedParallelJobs?: number;
  efficiencyCoefficient?: number;
  efficiencyPercent?: number;
  dedicatedTo?: "ANY" | "GENERAL_ONLY" | "BETA_LACTAM";
  groupId?: string | null;
  siteId?: string | null;
  displayColor?: string | null;
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

  const efficiencyCoefficient =
    patch.efficiencyPercent != null
      ? patch.efficiencyPercent / 100
      : patch.efficiencyCoefficient;

  await prisma.workstation.update({
    where: { id: workstationId },
    data: {
      code: patch.code,
      name: patch.name,
      active: patch.active,
      allowedParallelJobs: patch.allowedParallelJobs,
      efficiencyCoefficient,
      dedicatedTo: patch.dedicatedTo,
      groupId: patch.groupId,
      siteId: patch.siteId,
      displayColor: patch.displayColor,
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
