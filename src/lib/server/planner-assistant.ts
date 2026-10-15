import type { Prisma } from "@prisma/client";

import {
  parsePlannerAssistantMessage,
  PLANNER_ASSISTANT_HELP,
  type PlannerAssistantIntent,
} from "@/lib/operations/planner-assistant-intents";
import { canProposeSchedule, resolvePlannerAccess } from "@/lib/auth/planner-access";
import { requirePermission } from "@/lib/auth/authorization";
import { proposeRescheduleAll, simulateDeliveryDate } from "@/lib/server/aps-plan";
import { writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";
import { getOperationsPlanner, resolvePlanningWindow } from "@/lib/server/operations";
import {
  createProductionOrderPhase2,
  createProductionProspect,
} from "@/lib/server/production-orders-phase2";

export type PlannerAssistantDraftView = {
  id: string;
  intent: PlannerAssistantIntent;
  summary: string;
  detail: string;
  expiresAt: string;
  canAccept: boolean;
};

export type PlannerAssistantTurn = {
  role: "assistant" | "user";
  text: string;
  drafts?: PlannerAssistantDraftView[];
};

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

async function resolveProduct(ctx: TenantContext, query: string | null) {
  if (!query) return null;
  const prisma = getPrisma();
  const q = query.trim();
  const bySku = await prisma.product.findFirst({
    where: { tenantId: ctx.tenantId, sku: { equals: q, mode: "insensitive" } },
  });
  if (bySku) return bySku;
  return prisma.product.findFirst({
    where: {
      tenantId: ctx.tenantId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q.replace(/\s+/g, ""), mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
  });
}

async function resolveCustomer(ctx: TenantContext, query: string | null) {
  if (!query) return null;
  return getPrisma().customer.findFirst({
    where: { tenantId: ctx.tenantId, name: { contains: query, mode: "insensitive" } },
    select: { id: true, name: true },
  });
}

async function resolveWorkstation(ctx: TenantContext, query: string | null) {
  if (!query) return null;
  const prisma = getPrisma();
  const byCode = await prisma.workstation.findFirst({
    where: { tenantId: ctx.tenantId, code: { equals: query, mode: "insensitive" } },
  });
  if (byCode) return byCode;
  return prisma.workstation.findFirst({
    where: { tenantId: ctx.tenantId, name: { contains: query, mode: "insensitive" } },
  });
}

function startOfTomorrowUtc(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return d;
}

export async function chatPlannerAssistant(ctx: TenantContext, message: string): Promise<PlannerAssistantTurn> {
  requirePermission(ctx, "production.read");
  const userId = ctx.userId;
  if (!userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");

  const parsed = parsePlannerAssistantMessage(message);
  const access = await resolvePlannerAccess(ctx);
  const canAccept = canProposeSchedule(ctx, access);

  if (parsed.intent === "HELP") {
    return { role: "assistant", text: PLANNER_ASSISTANT_HELP };
  }

  if (parsed.intent === "SUMMARY_AT_RISK") {
    const planner = await getOperationsPlanner(ctx, resolvePlanningWindow({ weeks: "2" }));
    const atRisk = planner.orders.filter((o) => o.displayStatus === "AT_RISK").length;
    const unscheduled = planner.orders.filter((o) => o.displayStatus === "UNSCHEDULED").length;
    return {
      role: "assistant",
      text: `In the current 2-week horizon: ${atRisk} order(s) at risk, ${unscheduled} unscheduled, ${planner.orders.length} total in scope. Open the Gantt or Dashboard for detail — I can draft a reschedule-all proposal if you ask.`,
    };
  }

  let summary = "";
  let detail = "";
  const payload: Record<string, unknown> = { intent: parsed.intent };

  if (parsed.intent === "PROPOSE_RESCHEDULE_ALL") {
    summary = "Propose reschedule all (finite-capacity plan)";
    const planner = await getOperationsPlanner(ctx, resolvePlanningWindow({ weeks: "2" }));
    const unscheduled = planner.orders.filter((o) => o.displayStatus === "UNSCHEDULED").length;
    detail = `${unscheduled} unscheduled order(s) in the current window. Accept runs the deterministic engine and saves a PROPOSED plan — review on Planner engine or Execution before accepting the schedule.`;
    payload.mode = "propose_on_accept";
  }

  if (parsed.intent === "WORKSTATION_DOWNTIME") {
    const ws = await resolveWorkstation(ctx, parsed.workstationQuery);
    if (!ws) {
      return {
        role: "assistant",
        text: `I could not match a workstation for "${parsed.workstationQuery ?? "unknown"}". Use a code like CMP-2 or a line name from the plant model.`,
      };
    }
    const date = startOfTomorrowUtc(new Date());
    summary = `Close ${ws.code} · ${parsed.downtimeDays ?? 1} day(s) · what-if`;
    detail = `Accept will create a calendar exception on ${date.toISOString().slice(0, 10)} for ${ws.name}, then run reschedule-all to produce a new PROPOSED plan showing knock-on delays.`;
    payload.workstationId = ws.id;
    payload.workstationCode = ws.code;
    payload.date = date.toISOString();
    payload.reason = "Planner assistant downtime scenario";
  }

  if (parsed.intent === "CREATE_FIRM_ORDER" || parsed.intent === "CREATE_PROSPECT_ORDER") {
    const product = await resolveProduct(ctx, parsed.productQuery);
    if (!product) {
      return {
        role: "assistant",
        text: `I need a product I can match (name or SKU). You said: "${parsed.productQuery ?? "—"}". Try including SKU or a catalog name like Amoxicillin 500mg.`,
      };
    }
    const customer = await resolveCustomer(ctx, parsed.customerQuery);
    let quantity = parsed.quantity ?? 0;
    if (parsed.batchCount && product.validatedBatchSize) {
      quantity = parsed.batchCount * product.validatedBatchSize;
    }
    if (quantity <= 0) {
      quantity = product.validatedBatchSize ?? 100_000;
    }
    const dueDate = parsed.dueDateIso ?? new Date(Date.now() + 21 * 86_400_000).toISOString();
    const simulation = await simulateDeliveryDate(ctx, {
      productId: product.id,
      quantity,
      dueDate,
      priority: "NORMAL",
    }).catch(() => null);

    summary =
      parsed.intent === "CREATE_PROSPECT_ORDER"
        ? `Prospect · ${product.sku} · ${quantity.toLocaleString("en-KE")} units`
        : `Firm order · ${product.sku} · ${quantity.toLocaleString("en-KE")} units`;
    detail = [
      `Product: ${product.name} (${product.sku})`,
      customer ? `Customer: ${customer.name}` : "Customer: not specified",
      `Due: ${dueDate.slice(0, 10)}`,
      simulation?.feasibleEnd
        ? `Simulated feasible end: ${simulation.feasibleEnd.slice(0, 10)} (${simulation.late ? "late vs due date" : "on time"})`
        : "Delivery simulation unavailable.",
      "Accept creates the order in the database; prospects stay PROSPECT until converted.",
    ].join("\n");

    payload.productId = product.id;
    payload.productSku = product.sku;
    payload.quantity = quantity;
    payload.dueDate = dueDate;
    payload.customerId = customer?.id ?? null;
    payload.orderKind = parsed.intent === "CREATE_PROSPECT_ORDER" ? "PROSPECT" : "FIRM";
  }

  const draft = await getPrisma().plannerAssistantDraft.create({
    data: {
      tenantId: ctx.tenantId,
      userId,
      intent: parsed.intent,
      summary,
      payload: payload as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    },
  });

  return {
    role: "assistant",
    text: `Here is a draft you can accept or ignore. Nothing has been written yet.\n\n${detail}`,
    drafts: [
      {
        id: draft.id,
        intent: parsed.intent as PlannerAssistantIntent,
        summary,
        detail,
        expiresAt: draft.expiresAt.toISOString(),
        canAccept,
      },
    ],
  };
}

export async function acceptPlannerAssistantDraft(ctx: TenantContext, draftId: string) {
  requirePermission(ctx, "production.schedule");
  const userId = ctx.userId;
  if (!userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");

  const draft = await getPrisma().plannerAssistantDraft.findFirst({
    where: { id: draftId, tenantId: ctx.tenantId, userId, status: "DRAFT" },
  });
  if (!draft) throw new ServerError("Draft not found or already decided.", "NOT_FOUND");
  if (draft.expiresAt.getTime() < Date.now()) {
    await getPrisma().plannerAssistantDraft.update({ where: { id: draft.id }, data: { status: "EXPIRED" } });
    throw new ServerError("Draft expired.", "FORBIDDEN");
  }

  const payload = draft.payload as Record<string, unknown>;
  const intent = draft.intent as PlannerAssistantIntent;
  let resultSummary = "";

  if (intent === "PROPOSE_RESCHEDULE_ALL") {
    const plan = await proposeRescheduleAll(ctx);
    resultSummary = `Proposed ${plan.name} (v${plan.version}). Review on Planner engine or Execution.`;
  } else if (intent === "WORKSTATION_DOWNTIME") {
    const workstationId = payload.workstationId as string;
    const date = new Date(payload.date as string);
    await getPrisma().workstationCalendarException.create({
      data: {
        tenantId: ctx.tenantId,
        workstationId,
        date,
        reason: (payload.reason as string) ?? "Planner assistant downtime",
        closed: true,
      },
    });
    const plan = await proposeRescheduleAll(ctx);
    resultSummary = `Exception recorded; proposed ${plan.name}.`;
  } else if (intent === "CREATE_FIRM_ORDER") {
    const created = await createProductionOrderPhase2(ctx, {
      productId: payload.productId as string,
      quantity: payload.quantity as number,
      dueDate: payload.dueDate as string,
      customerId: (payload.customerId as string | null) ?? null,
      orderKind: "FIRM",
    });
    resultSummary = `Created firm order ${created.orderNumber}.`;
  } else if (intent === "CREATE_PROSPECT_ORDER") {
    const created = await createProductionProspect(ctx, {
      productId: payload.productId as string,
      quantity: payload.quantity as number,
      dueDate: payload.dueDate as string,
      customerId: (payload.customerId as string | null) ?? null,
      simulate: true,
    });
    resultSummary = `Created prospect ${created.orderNumber}.`;
  } else {
    throw new ServerError("This draft cannot be executed.", "INTERNAL");
  }

  await getPrisma().plannerAssistantDraft.update({
    where: { id: draft.id },
    data: { status: "ACCEPTED", decidedAt: new Date() },
  });

  await writeAuditLog(ctx, {
    action: "PLANNER_ASSISTANT_ACCEPTED",
    entityType: "PLANNER_ASSISTANT_DRAFT",
    entityId: draft.id,
    newValue: resultSummary,
    reason: intent,
  });

  return { ok: true, summary: resultSummary };
}

export async function rejectPlannerAssistantDraft(ctx: TenantContext, draftId: string) {
  const userId = ctx.userId;
  if (!userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  await getPrisma().plannerAssistantDraft.updateMany({
    where: { id: draftId, tenantId: ctx.tenantId, userId, status: "DRAFT" },
    data: { status: "REJECTED", decidedAt: new Date() },
  });
  return { ok: true };
}
