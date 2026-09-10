import type { CommunicationStatus, CommunicationType } from "@prisma/client";

import {
  COMMUNICATION_REGISTRY,
  isCommunicationType,
  isUnsafeCommunicationText,
  type CommunicationDraftView,
  type CommunicationStatusName,
  type CommunicationTypeName,
  type ModelCommunicationDraft,
} from "@/lib/ai/communications";
import { canApprove } from "@/lib/server/actions";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";

function requireUser(ctx: TenantContext): string {
  if (!ctx.userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  return ctx.userId;
}

function previewOf(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

function toView(row: {
  id: string;
  type: CommunicationType;
  status: CommunicationStatus;
  subject: string;
  body: string;
  reason: string;
  createdAt: Date;
  customer: { name: string };
}): CommunicationDraftView {
  return {
    id: row.id,
    type: row.type as CommunicationTypeName,
    status: row.status as CommunicationStatusName,
    customerName: row.customer.name,
    subject: row.subject,
    body: row.body,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    preview: previewOf(row.body),
  };
}

async function resolveCustomers(tenantId: string, name: string) {
  const term = name.trim();
  if (!term) return [];
  const prisma = getPrisma();
  const exact = await prisma.customer.findMany({
    where: { tenantId, name: { equals: term, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 5,
  });
  if (exact.length === 1) return exact;
  if (exact.length > 1) return exact;
  return prisma.customer.findMany({
    where: { tenantId, name: { contains: term, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 5,
  });
}

export type ProposeCommunicationResult =
  | { status: "created"; draft: CommunicationDraftView }
  | { status: "clarification"; message: string }
  | { status: "skipped" };

export async function proposeCommunication(
  ctx: TenantContext,
  input: ModelCommunicationDraft
): Promise<ProposeCommunicationResult> {
  if (!isCommunicationType(input.type)) return { status: "skipped" };
  if (isUnsafeCommunicationText(`${input.subject}\n${input.body}`)) return { status: "skipped" };
  const userId = requireUser(ctx);
  const matches = await resolveCustomers(ctx.tenantId, input.targetName);
  if (matches.length === 0) {
    return {
      status: "clarification",
      message: `I could not match a customer named “${input.targetName}” in this workspace. Name the account to prepare a draft.`,
    };
  }
  if (matches.length > 1) {
    const names = matches.map((row) => row.name).join(", ");
    return {
      status: "clarification",
      message: `More than one customer matches that name (${names}). Specify the exact account.`,
    };
  }

  const customer = matches[0];
  let opportunityId: string | undefined;
  if (input.type === "SALES_OPPORTUNITY_FOLLOW_UP") {
    const opportunities = await getPrisma().opportunity.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { id: true },
      take: 2,
      orderBy: { createdAt: "desc" },
    });
    if (opportunities.length === 1) opportunityId = opportunities[0].id;
  }

  const recent = await getPrisma().communicationDraft.findFirst({
    where: {
      tenantId: ctx.tenantId,
      customerId: customer.id,
      type: input.type,
      subject: input.subject,
      status: "DRAFT",
      createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
    },
    include: { customer: { select: { name: true } } },
  });
  if (recent) return { status: "created", draft: toView(recent) };

  const created = await getPrisma().communicationDraft.create({
    data: {
      tenantId: ctx.tenantId,
      createdById: userId,
      type: input.type,
      status: "DRAFT",
      customerId: customer.id,
      opportunityId,
      subject: input.subject,
      body: input.body,
      reason: input.reason,
    },
    include: { customer: { select: { name: true } } },
  });

  await getPrisma().activity.create({
    data: {
      tenantId: ctx.tenantId,
      type: "NOTE",
      title: "Communication draft created",
      description: `${COMMUNICATION_REGISTRY[input.type].label} for ${customer.name}.`,
      entityType: "CUSTOMER",
      entityId: customer.id,
    },
  });

  return { status: "created", draft: toView(created) };
}

export async function listCommunications(ctx: TenantContext) {
  const rows = await getPrisma().communicationDraft.findMany({
    where: { tenantId: ctx.tenantId },
    include: { customer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const items = rows.map(toView);
  return {
    needsReview: items.filter((item) => item.status === "DRAFT"),
    recent: items.filter((item) => item.status !== "DRAFT"),
  };
}

export async function getCommunication(ctx: TenantContext, id: string) {
  const row = await getPrisma().communicationDraft.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { customer: { select: { name: true } } },
  });
  if (!row) throw new ServerError("Communication draft not found.", "NOT_FOUND");
  return toView(row);
}

export async function updateCommunication(
  ctx: TenantContext,
  id: string,
  input: { subject?: string; body?: string; status?: string }
) {
  requireUser(ctx);
  const existing = await getPrisma().communicationDraft.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { customer: { select: { name: true } } },
  });
  if (!existing) throw new ServerError("Communication draft not found.", "NOT_FOUND");

  const subject = typeof input.subject === "string" ? input.subject.trim().slice(0, 160) : existing.subject;
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 2000) : existing.body;
  if (!subject || !body) throw new ServerError("Subject and body are required.", "FORBIDDEN");
  if (isUnsafeCommunicationText(`${subject}\n${body}`)) {
    throw new ServerError("This draft cannot include medical advice.", "FORBIDDEN");
  }

  let status = existing.status;
  let reviewedAt = existing.reviewedAt;
  let approvedAt = existing.approvedAt;
  if (input.status === "APPROVED" || input.status === "ARCHIVED") {
    if (!canApprove(ctx.role)) {
      throw new ServerError("You do not have permission to approve this draft.", "FORBIDDEN");
    }
    status = input.status;
    if (input.status === "APPROVED") approvedAt = new Date();
  } else if (subject !== existing.subject || body !== existing.body || existing.status === "DRAFT") {
    status = existing.status === "ARCHIVED" || existing.status === "APPROVED" ? existing.status : "REVIEWED";
    reviewedAt = new Date();
  }

  const updated = await getPrisma().communicationDraft.update({
    where: { id: existing.id },
    data: { subject, body, status, reviewedAt, approvedAt },
    include: { customer: { select: { name: true } } },
  });
  return toView(updated);
}
