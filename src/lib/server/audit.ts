import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
};

export function formatStateChange(
  label: string,
  from: string | null | undefined,
  to: string | null | undefined
): { oldValue: string; newValue: string } {
  return {
    oldValue: `${label}: ${from ?? "—"}`,
    newValue: `${label}: ${to ?? "—"}`,
  };
}

export async function writeAuditLog(ctx: TenantContext, input: AuditInput): Promise<void> {
  await getPrisma().auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      reason: input.reason?.trim() || null,
    },
  });
}
