import { Prisma, type ActionStatus, type ActionType } from "@prisma/client";

import {
  ACTION_REGISTRY,
  isActionType,
  type ActionListItem,
  type ActionProposal,
  type ActionTypeName,
} from "@/lib/ai/actions";
import { canApprove } from "@/lib/auth/authorization";
import { writeAuditLog, formatStateChange } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";

type AuditEvent = { at: string; userId: string; event: string };

function requireUser(ctx: TenantContext): string {
  if (!ctx.userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  return ctx.userId;
}

export { canApprove } from "@/lib/auth/authorization";

function appendAudit(existing: Prisma.JsonValue, event: AuditEvent): Prisma.InputJsonValue {
  const list = Array.isArray(existing) ? existing : [];
  return [...list, event] as Prisma.InputJsonValue;
}

export async function writeActionEffects(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    type: ActionTypeName;
    title: string;
    reason: string;
    customer: { id: string; name: string };
  }
) {
  if (input.type === "CREATE_SALES_OPPORTUNITY") {
    const opportunity = await tx.opportunity.create({
      data: {
        tenantId: input.tenantId,
        title: input.title,
        description: input.reason,
        type: "SALES",
        priority: "MEDIUM",
        status: "OPEN",
      },
    });
    await tx.activity.create({
      data: {
        tenantId: input.tenantId,
        type: "NOTE",
        title: "Sales opportunity created",
        description: `${input.title} — ${input.customer.name}`,
        entityType: "OPPORTUNITY",
        entityId: opportunity.id,
      },
    });
    return;
  }

  await tx.activity.create({
    data: {
      tenantId: input.tenantId,
      type: "NOTE",
      title: input.type === "CREATE_CUSTOMER_FOLLOW_UP" ? "Customer follow-up created" : "Follow-up task created",
      description: `${input.title} — ${input.customer.name}`,
      entityType: "CUSTOMER",
      entityId: input.customer.id,
    },
  });
}

async function resolveCustomer(tenantId: string, name: string) {
  const term = name.trim();
  if (!term) return null;
  return getPrisma().customer.findFirst({
    where: { tenantId, name: { contains: term, mode: "insensitive" } },
    select: { id: true, name: true },
  });
}

export async function proposeAction(
  ctx: TenantContext,
  input: { type: string; title: string; reason: string; targetName: string }
): Promise<ActionProposal | null> {
  if (!isActionType(input.type)) return null;
  const userId = requireUser(ctx);
  const customer = await resolveCustomer(ctx.tenantId, input.targetName);
  if (!customer) return null;

  const now = new Date();
  const event: AuditEvent = { at: now.toISOString(), userId, event: "proposed" };
  const created = await getPrisma().action.create({
    data: {
      tenantId: ctx.tenantId,
      createdById: userId,
      type: input.type as ActionType,
      status: "PENDING_APPROVAL",
      title: input.title.slice(0, 160),
      description: ACTION_REGISTRY[input.type].description,
      reason: input.reason.slice(0, 400),
      targetKind: "CUSTOMER",
      targetId: customer.id,
      targetLabel: customer.name,
      proposedAt: now,
      audit: [event],
    },
  });

  return toProposal(created);
}

function toProposal(row: {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  reason: string;
  targetLabel: string;
  status: ActionStatus;
}): ActionProposal {
  return {
    id: row.id,
    type: row.type as ActionTypeName,
    title: row.title,
    description: row.description,
    reason: row.reason,
    targetLabel: row.targetLabel,
    expectedResult: ACTION_REGISTRY[row.type as ActionTypeName].expectedResult,
    requiresApproval: true,
    status: row.status,
  };
}

export async function listActions(ctx: TenantContext): Promise<{ pending: ActionListItem[]; history: ActionListItem[] }> {
  const rows = await getPrisma().action.findMany({
    where: { tenantId: ctx.tenantId },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const items: ActionListItem[] = rows.map((row) => ({
    id: row.id,
    type: row.type as ActionTypeName,
    title: row.title,
    reason: row.reason,
    targetLabel: row.targetLabel,
    status: row.status,
    proposedAt: row.proposedAt.toISOString(),
    createdByName: row.createdBy.name,
  }));
  return {
    pending: items.filter((item) => item.status === "PENDING_APPROVAL"),
    history: items.filter((item) => item.status !== "PENDING_APPROVAL"),
  };
}

export async function decideAction(ctx: TenantContext, actionId: string, decision: "approve" | "reject") {
  const userId = requireUser(ctx);
  if (decision === "approve" && !canApprove(ctx.role)) {
    throw new ServerError("You do not have permission to approve this action.", "FORBIDDEN");
  }

  const prisma = getPrisma();
  const existing = await prisma.action.findFirst({ where: { id: actionId, tenantId: ctx.tenantId } });
  if (!existing) throw new ServerError("Action not found.", "NOT_FOUND");

  if (decision === "reject") {
    if (existing.status !== "PENDING_APPROVAL") {
      throw new ServerError("This action can no longer be rejected.", "FORBIDDEN");
    }
    const updated = await prisma.action.update({
      where: { id: existing.id },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        approvedById: userId,
        audit: appendAudit(existing.audit, { at: new Date().toISOString(), userId, event: "rejected" }),
      },
    });
    const change = formatStateChange("STATUS", "PENDING_APPROVAL", "REJECTED");
    await writeAuditLog(ctx, {
      action: "ACTION_REJECTED",
      entityType: "ACTION",
      entityId: existing.id,
      oldValue: change.oldValue,
      newValue: change.newValue,
    });
    return toProposal(updated);
  }

  if (existing.status === "EXECUTED") return toProposal(existing);
  if (existing.status !== "PENDING_APPROVAL") {
    throw new ServerError("This action cannot be executed.", "FORBIDDEN");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const target = existing.targetId
        ? await tx.customer.findFirst({ where: { id: existing.targetId, tenantId: ctx.tenantId } })
        : null;
      if (!target) throw new ServerError("The action target is not valid.", "NOT_FOUND");

      const locked = await tx.action.updateMany({
        where: { id: existing.id, tenantId: ctx.tenantId, status: "PENDING_APPROVAL" },
        data: {
          status: "APPROVED",
          approvedById: userId,
          approvedAt: new Date(),
        },
      });
      if (locked.count !== 1) {
        const current = await tx.action.findFirst({ where: { id: existing.id, tenantId: ctx.tenantId } });
        if (current?.status === "EXECUTED") return current;
        throw new ServerError("This action cannot be executed.", "FORBIDDEN");
      }

      await writeActionEffects(tx, {
        tenantId: ctx.tenantId,
        type: existing.type as ActionTypeName,
        title: existing.title,
        reason: existing.reason,
        customer: target,
      });

      return tx.action.update({
        where: { id: existing.id },
        data: {
          status: "EXECUTED",
          executedAt: new Date(),
          audit: appendAudit(existing.audit, { at: new Date().toISOString(), userId, event: "executed" }),
        },
      });
    });
    const change = formatStateChange("STATUS", "PENDING_APPROVAL", "EXECUTED");
    await writeAuditLog(ctx, {
      action: "ACTION_APPROVED",
      entityType: "ACTION",
      entityId: existing.id,
      oldValue: change.oldValue,
      newValue: change.newValue,
    });
    return toProposal(result);
  } catch (error) {
    if (error instanceof ServerError && error.code === "FORBIDDEN") throw error;
    if (error instanceof ServerError) {
      await prisma.action.update({
        where: { id: existing.id },
        data: {
          status: "FAILED",
          failureReason: error.message,
          audit: appendAudit(existing.audit, { at: new Date().toISOString(), userId, event: "failed" }),
        },
      });
      throw error;
    }
    await prisma.action.update({
      where: { id: existing.id },
      data: {
        status: "FAILED",
        failureReason: "Unable to complete the action.",
        audit: appendAudit(existing.audit, { at: new Date().toISOString(), userId, event: "failed" }),
      },
    });
    throw new ServerError("Unable to complete the action.", "INTERNAL");
  }
}

export function parseModelAction(raw: unknown): { type: string; title: string; reason: string; targetName: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = typeof row.type === "string" ? row.type : "";
  if (type === "NONE" || !isActionType(type)) return null;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const reason = typeof row.reason === "string" ? row.reason.trim() : "";
  const targetName = typeof row.targetName === "string" ? row.targetName.trim() : "";
  if (!title || !reason || !targetName) return null;
  return { type, title, reason, targetName };
}
