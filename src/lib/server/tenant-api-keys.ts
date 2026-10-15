import { generateApiKey } from "@/lib/server/api-key-auth";
import { requirePermission } from "@/lib/auth/authorization";
import { writeAuditLog } from "@/lib/server/audit";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";

export const DEFAULT_API_KEY_SCOPES = [
  "production.read",
  "production.write",
  "timelogs.read",
  "timelogs.write",
  "schedule.read",
];

export type TenantApiKeyView = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function listTenantApiKeys(ctx: TenantContext): Promise<TenantApiKeyView[]> {
  requirePermission(ctx, "production.global_rules");
  const rows = await getPrisma().tenantApiKey.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: (row.scopes as string[]) ?? [],
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function createTenantApiKey(
  ctx: TenantContext,
  input: { name: string; scopes?: string[] }
): Promise<{ key: TenantApiKeyView; rawKey: string }> {
  requirePermission(ctx, "production.global_rules");
  const name = input.name.trim();
  if (!name) throw new ServerError("Key name is required.", "INTERNAL");
  const { rawKey, prefix, hash } = generateApiKey();
  const scopes = input.scopes?.length ? input.scopes : DEFAULT_API_KEY_SCOPES;
  const row = await getPrisma().tenantApiKey.create({
    data: {
      tenantId: ctx.tenantId,
      name,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: scopes as unknown as object,
    },
  });
  await writeAuditLog(ctx, {
    action: "TENANT_API_KEY_CREATED",
    entityType: "TENANT_API_KEY",
    entityId: row.id,
    newValue: `${name} · ${prefix}…`,
  });
  return {
    rawKey,
    key: {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      scopes,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: null,
    },
  };
}
