import { requirePermission } from "@/lib/auth/authorization";
import { availabilityAfterBreakdown, splitDownWindow } from "@/lib/operations/breakdown-window";
import { buildWorkCalendar, intervalsForDay } from "@/lib/operations/calendar";
import { resolveCurrentShopFloorOperation } from "@/lib/operations/current-shop-floor-operation";
import { addPlantDays, plantMinuteOfDay, plantYmd, startOfPlantDay } from "@/lib/operations/plant-time";
import type { ShopFloorActionOptions } from "@/lib/production-execution/shop-floor-action-input";
import { nextQualityReference } from "@/lib/quality/service";
import { loadOpenShopFloorTimerOperationIds } from "@/lib/server/active-shop-floor-timers";
import { writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";
import { recordProductionOperationEvent } from "@/lib/server/production-operation-events";

export const SHOP_FLOOR_ISSUE_KINDS = ["BREAKDOWN", "MATERIAL", "QUALITY_DEVIATION", "SAFETY", "OTHER"] as const;
export type ShopFloorIssueKind = (typeof SHOP_FLOOR_ISSUE_KINDS)[number];

export const SHOP_FLOOR_ISSUE_LABELS: Record<ShopFloorIssueKind, string> = {
  BREAKDOWN: "Machine breakdown",
  MATERIAL: "Material problem",
  QUALITY_DEVIATION: "Quality deviation",
  SAFETY: "Safety incident",
  OTHER: "Other issue",
};

/** Issues that open a Quality exception for QA to investigate. */
const QUALITY_KINDS = new Set<ShopFloorIssueKind>(["QUALITY_DEVIATION", "MATERIAL"]);

export type RaiseShopFloorIssueInput = {
  kind: string;
  description: string;
  severity?: string;
  /** Breakdown only: hours the station is expected to be down (0 = unknown, no capacity change). */
  downHours?: number;
} & ShopFloorActionOptions;

export function parseIssueKind(value: unknown): ShopFloorIssueKind | null {
  if (typeof value !== "string") return null;
  return (SHOP_FLOOR_ISSUE_KINDS as readonly string[]).includes(value) ? (value as ShopFloorIssueKind) : null;
}

function parseSeverity(value: unknown): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  return value === "CRITICAL" || value === "HIGH" || value === "LOW" ? value : "MEDIUM";
}

/**
 * Operator raises an issue from the shop floor (spec Phase 5):
 * - Breakdown with a down estimate → workstation calendar exception (capacity removed), then DOWNTIME
 *   on the running step so the autopilot policy can propose a replan that already sees the outage.
 * - Material / quality deviation → Quality exception linked to the order and batch (QA owns it).
 * Every branch is audited. Operators need only `production.execute`.
 */
export async function raiseShopFloorIssue(ctx: TenantContext, orderId: string, input: RaiseShopFloorIssueInput) {
  requirePermission(ctx, "production.execute");
  const kind = parseIssueKind(input.kind);
  if (!kind) throw new ServerError("Pick what kind of issue this is.", "INTERNAL");
  const description = input.description?.trim() ?? "";
  if (description.length < 5) throw new ServerError("Describe the issue in a few words.", "INTERNAL");
  if (description.length > 500) throw new ServerError("Keep the description under 500 characters.", "INTERNAL");
  if (input.recordedAt === null) {
    throw new ServerError("This offline log is more than 24 hours old. Ask a supervisor to enter it manually.", "INTERNAL");
  }

  const prisma = getPrisma();
  const order = await prisma.productionOrder.findFirst({
    where: { id: orderId, tenantId: ctx.tenantId },
    include: {
      batch: { select: { id: true, batchNumber: true } },
      operations: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          operationCode: true,
          operationName: true,
          status: true,
          sequence: true,
          workstationId: true,
        },
      },
    },
  });
  if (!order) throw new ServerError("Production order not found.", "NOT_FOUND");

  const openIds = await loadOpenShopFloorTimerOperationIds(ctx.tenantId);
  const current = resolveCurrentShopFloorOperation(order.operations, openIds);
  const at = input.recordedAt ?? new Date();
  const workstationId = current?.workstationId ?? order.workstationId;
  const label = SHOP_FLOOR_ISSUE_LABELS[kind];
  const severity = parseSeverity(input.severity);
  const result: {
    kind: ShopFloorIssueKind;
    calendarDays: string[];
    qualityReference: string | null;
    downtimeLogged: boolean;
    message: string;
  } = { kind, calendarDays: [], qualityReference: null, downtimeLogged: false, message: "" };

  // 1. Breakdown → remove capacity for the down window.
  const downHours = Math.max(0, Math.min(72, Number(input.downHours) || 0));
  if (kind === "BREAKDOWN" && workstationId && downHours > 0) {
    const workstation = await prisma.workstation.findFirst({
      where: { id: workstationId, tenantId: ctx.tenantId },
      include: { shifts: true, calendarExceptions: true },
    });
    if (workstation) {
      const calendar = buildWorkCalendar({
        capacityHoursPerDay: workstation.capacityHoursPerDay,
        shifts: workstation.shifts.map((row) => ({
          weekday: row.weekday,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
        })),
        exceptions: workstation.calendarExceptions.map((row) => ({
          date: row.date.toISOString().slice(0, 10),
          reason: row.reason,
          closed: row.closed,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
        })),
      });
      const dayZero = startOfPlantDay(at);
      for (const part of splitDownWindow(plantMinuteOfDay(at), Math.round(downHours * 60))) {
        const day = addPlantDays(dayZero, part.dayOffset);
        const ymd = plantYmd(day);
        const available = availabilityAfterBreakdown(intervalsForDay(day, calendar), part.from, part.to);
        const reason = `Breakdown · ${description}`.slice(0, 190);
        const data = available.closed
          ? { closed: true, startMinute: null, endMinute: null, reason }
          : { closed: false, startMinute: available.startMinute, endMinute: available.endMinute, reason };
        const before = workstation.calendarExceptions.find((row) => row.date.toISOString().slice(0, 10) === ymd);
        await prisma.workstationCalendarException.upsert({
          where: { workstationId_date: { workstationId, date: new Date(`${ymd}T00:00:00.000Z`) } },
          create: { tenantId: ctx.tenantId, workstationId, date: new Date(`${ymd}T00:00:00.000Z`), ...data },
          update: data,
        });
        await writeAuditLog(ctx, {
          action: "WORKSTATION_EXCEPTION_FROM_SHOP_FLOOR",
          entityType: "WORKSTATION",
          entityId: workstationId,
          oldValue: before
            ? `${ymd} ${before.closed ? "closed" : `${before.startMinute}-${before.endMinute}`}`
            : `${ymd} weekly shifts`,
          newValue: `${ymd} ${data.closed ? "closed" : `${data.startMinute}-${data.endMinute}`}`,
          reason,
        });
        result.calendarDays.push(ymd);
      }
    }
  }

  // 2. Quality-related → open a Quality exception for QA.
  if (QUALITY_KINDS.has(kind)) {
    const count = await prisma.qualityException.count({ where: { tenantId: ctx.tenantId } });
    const reference = nextQualityReference(count);
    const step = current ? `${current.operationName || current.operationCode}` : "production";
    const row = await prisma.qualityException.create({
      data: {
        tenantId: ctx.tenantId,
        reference,
        title: `${label} at ${step} · ${order.orderNumber}`.slice(0, 160),
        description,
        type: kind === "MATERIAL" ? "MATERIAL_ISSUE" : "DEVIATION",
        severity,
        createdById: ctx.userId,
        productionOrderId: order.id,
        productionBatchId: order.batch?.id ?? null,
        productId: order.productId,
        events: {
          create: {
            tenantId: ctx.tenantId,
            eventType: "CREATED",
            toStatus: "OPEN",
            note: "Raised from the shop floor.",
            actorId: ctx.userId,
          },
        },
      },
    });
    await writeAuditLog(ctx, {
      action: "QUALITY_EXCEPTION_CREATED",
      entityType: "QUALITY_EXCEPTION",
      entityId: row.id,
      newValue: `REFERENCE: ${reference}`,
      reason: "Raised from the shop floor",
    });
    result.qualityReference = reference;
  }

  // 3. Stops work → DOWNTIME on the current step (may trigger an autopilot proposal; runs last so it sees the new calendar).
  if ((kind === "BREAKDOWN" || kind === "MATERIAL") && current) {
    await recordProductionOperationEvent(ctx, current.id, {
      eventType: "DOWNTIME",
      reason: `ISSUE:${kind} · ${description}`.slice(0, 480),
      recordedAt: input.recordedAt ?? undefined,
    });
    result.downtimeLogged = true;
  }

  await writeAuditLog(ctx, {
    action: "PRODUCTION_SHOP_FLOOR_ISSUE",
    entityType: "PRODUCTION_ORDER",
    entityId: order.id,
    newValue: `${kind}${current ? ` on ${current.operationCode}` : ""}${result.qualityReference ? ` · ${result.qualityReference}` : ""}`,
    reason: description,
  });

  const parts = [`${label} logged.`];
  if (result.calendarDays.length) parts.push(`Station capacity removed for ${downHours} h — planners will see it on the next replan.`);
  if (result.qualityReference) parts.push(`QA exception ${result.qualityReference} opened.`);
  result.message = parts.join(" ");
  return result;
}
