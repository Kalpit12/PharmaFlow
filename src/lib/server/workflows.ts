import { Prisma, type WorkflowStatus, type WorkflowType } from "@prisma/client";

import {
  WORKFLOW_REGISTRY,
  isWorkflowType,
  workflowStepLabels,
  type WorkflowListItem,
  type WorkflowProposal,
  type WorkflowTypeName,
} from "@/lib/ai/workflows";
import { canApprove, writeActionEffects } from "@/lib/server/actions";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";

type WorkflowContextPayload = {
  targetKind: "CUSTOMER";
  targetId: string;
  targetLabel: string;
  reason: string;
  opportunityId?: string;
  opportunityTitle?: string;
};

function requireUser(ctx: TenantContext): string {
  if (!ctx.userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  return ctx.userId;
}

function asContext(value: Prisma.JsonValue): WorkflowContextPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.targetKind !== "CUSTOMER") return null;
  if (typeof row.targetId !== "string" || typeof row.targetLabel !== "string") return null;
  if (typeof row.reason !== "string") return null;
  return {
    targetKind: "CUSTOMER",
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    reason: row.reason,
    opportunityId: typeof row.opportunityId === "string" ? row.opportunityId : undefined,
    opportunityTitle: typeof row.opportunityTitle === "string" ? row.opportunityTitle : undefined,
  };
}

async function resolveCustomer(tenantId: string, name: string) {
  const term = name.trim();
  if (!term) return null;
  return getPrisma().customer.findFirst({
    where: { tenantId, name: { contains: term, mode: "insensitive" } },
    select: { id: true, name: true },
  });
}

function toProposal(row: {
  id: string;
  type: WorkflowType;
  title: string;
  description: string;
  status: WorkflowStatus;
  context: Prisma.JsonValue;
}): WorkflowProposal {
  const context = asContext(row.context);
  const type = row.type as WorkflowTypeName;
  return {
    id: row.id,
    type,
    title: row.title,
    description: row.description,
    reason: context?.reason ?? "",
    targetLabel: context?.targetLabel ?? "",
    steps: workflowStepLabels(type),
    requiresApproval: true,
    status: row.status,
  };
}

export async function proposeWorkflow(
  ctx: TenantContext,
  input: { type: string; title: string; reason: string; targetName: string }
): Promise<WorkflowProposal | null> {
  if (!isWorkflowType(input.type)) return null;
  const userId = requireUser(ctx);
  const definition = WORKFLOW_REGISTRY[input.type];
  const customer = await resolveCustomer(ctx.tenantId, input.targetName);
  if (!customer) return null;

  let opportunity: { id: string; title: string } | null = null;
  if (definition.requiredContext === "CUSTOMER_AND_OPPORTUNITY") {
    opportunity = await getPrisma().opportunity.findFirst({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        OR: [
          { title: { contains: customer.name, mode: "insensitive" } },
          { description: { contains: customer.name, mode: "insensitive" } },
        ],
      },
      select: { id: true, title: true },
    });
    if (!opportunity) {
      opportunity = await getPrisma().opportunity.findFirst({
        where: { tenantId: ctx.tenantId, status: { in: ["OPEN", "IN_PROGRESS"] } },
        select: { id: true, title: true },
        orderBy: { createdAt: "desc" },
      });
    }
    if (!opportunity) return null;
  }

  const now = new Date();
  const context: WorkflowContextPayload = {
    targetKind: "CUSTOMER",
    targetId: customer.id,
    targetLabel: customer.name,
    reason: input.reason.slice(0, 400),
    opportunityId: opportunity?.id,
    opportunityTitle: opportunity?.title,
  };

  const created = await getPrisma().workflow.create({
    data: {
      tenantId: ctx.tenantId,
      createdById: userId,
      type: input.type as WorkflowType,
      status: "PENDING_APPROVAL",
      title: input.title.slice(0, 160),
      description: definition.description,
      context,
      proposedAt: now,
    },
  });

  return toProposal(created);
}

export async function listWorkflows(
  ctx: TenantContext
): Promise<{ pending: WorkflowListItem[]; history: WorkflowListItem[] }> {
  const rows = await getPrisma().workflow.findMany({
    where: { tenantId: ctx.tenantId },
    include: {
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const items: WorkflowListItem[] = rows.map((row) => {
    const context = asContext(row.context);
    const type = row.type as WorkflowTypeName;
    return {
      id: row.id,
      type,
      title: row.title,
      reason: context?.reason ?? "",
      targetLabel: context?.targetLabel ?? "",
      status: row.status,
      proposedAt: row.proposedAt.toISOString(),
      createdByName: row.createdBy.name,
      reviewerName: row.approvedBy?.name ?? null,
      steps: workflowStepLabels(type),
    };
  });
  return {
    pending: items.filter((item) => item.status === "PENDING_APPROVAL"),
    history: items.filter((item) => item.status !== "PENDING_APPROVAL"),
  };
}

export async function decideWorkflow(ctx: TenantContext, workflowId: string, decision: "approve" | "reject") {
  const userId = requireUser(ctx);
  if (decision === "approve" && !canApprove(ctx.role)) {
    throw new ServerError("You do not have permission to approve this workflow.", "FORBIDDEN");
  }

  const prisma = getPrisma();
  const existing = await prisma.workflow.findFirst({ where: { id: workflowId, tenantId: ctx.tenantId } });
  if (!existing) throw new ServerError("Workflow not found.", "NOT_FOUND");

  if (decision === "reject") {
    if (existing.status !== "PENDING_APPROVAL") {
      throw new ServerError("This workflow can no longer be rejected.", "FORBIDDEN");
    }
    const updated = await prisma.workflow.update({
      where: { id: existing.id },
      data: { status: "REJECTED", approvedById: userId },
    });
    return toProposal(updated);
  }

  if (existing.status === "COMPLETED") return toProposal(existing);
  if (existing.status === "RUNNING") {
    throw new ServerError("This workflow is already running.", "FORBIDDEN");
  }
  if (existing.status !== "PENDING_APPROVAL" && existing.status !== "FAILED") {
    throw new ServerError("This workflow cannot be executed.", "FORBIDDEN");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.workflow.updateMany({
        where: {
          id: existing.id,
          tenantId: ctx.tenantId,
          status: { in: ["PENDING_APPROVAL", "FAILED"] },
        },
        data: {
          status: "RUNNING",
          approvedById: userId,
          approvedAt: new Date(),
          failureReason: null,
          failedAt: null,
        },
      });
      if (locked.count !== 1) {
        const current = await tx.workflow.findFirst({ where: { id: existing.id, tenantId: ctx.tenantId } });
        if (current?.status === "COMPLETED") return current;
        throw new ServerError("This workflow cannot be executed.", "FORBIDDEN");
      }

      const context = asContext(existing.context);
      if (!context) throw new ServerError("The workflow target is not valid.", "NOT_FOUND");

      const customer = await tx.customer.findFirst({
        where: { id: context.targetId, tenantId: ctx.tenantId },
        select: { id: true, name: true },
      });
      if (!customer) throw new ServerError("The workflow target is not valid.", "NOT_FOUND");

      const definition = WORKFLOW_REGISTRY[existing.type as WorkflowTypeName];
      if (definition.requiredContext === "CUSTOMER_AND_OPPORTUNITY") {
        if (!context.opportunityId) throw new ServerError("The workflow target is not valid.", "NOT_FOUND");
        const opportunity = await tx.opportunity.findFirst({
          where: { id: context.opportunityId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!opportunity) throw new ServerError("The workflow target is not valid.", "NOT_FOUND");
      }

      const now = new Date();
      for (const step of definition.steps) {
        await writeActionEffects(tx, {
          tenantId: ctx.tenantId,
          type: step,
          title: existing.title,
          reason: context.reason,
          customer,
        });
        await tx.action.create({
          data: {
            tenantId: ctx.tenantId,
            createdById: existing.createdById,
            approvedById: userId,
            workflowId: existing.id,
            type: step,
            status: "EXECUTED",
            title: existing.title,
            description: definition.description,
            reason: context.reason,
            targetKind: "CUSTOMER",
            targetId: customer.id,
            targetLabel: customer.name,
            proposedAt: existing.proposedAt,
            approvedAt: now,
            executedAt: now,
            audit: [{ at: now.toISOString(), userId, event: "executed_via_workflow" }] as Prisma.InputJsonValue,
          },
        });
      }

      await tx.activity.create({
        data: {
          tenantId: ctx.tenantId,
          type: "NOTE",
          title: `${definition.title} completed`,
          description: `${definition.title} workflow completed for ${customer.name}.`,
          entityType: "CUSTOMER",
          entityId: customer.id,
        },
      });

      return tx.workflow.update({
        where: { id: existing.id },
        data: {
          status: "COMPLETED",
          completedAt: now,
        },
      });
    });
    return toProposal(result);
  } catch (error) {
    if (error instanceof ServerError && error.code === "FORBIDDEN") throw error;
    const message = error instanceof ServerError ? error.message : "Unable to complete the workflow.";
    await prisma.workflow.update({
      where: { id: existing.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: message,
      },
    });
    if (error instanceof ServerError) throw error;
    throw new ServerError("Unable to complete the workflow.", "INTERNAL");
  }
}
