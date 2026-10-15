import { createHash, randomBytes } from "node:crypto";

import { getPrisma } from "@/lib/server/db";
import { ServerError } from "@/lib/server/errors";
import type { TenantContext } from "@/lib/server/errors";

export const API_KEY_PREFIX = "pf_live_";

export type ApiKeyAuth = {
  tenantId: string;
  keyId: string;
  scopes: string[];
};

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey(): { rawKey: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  const rawKey = `${API_KEY_PREFIX}${secret}`;
  return {
    rawKey,
    prefix: rawKey.slice(0, 12),
    hash: hashApiKey(rawKey),
  };
}

export function parseApiKeyFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return request.headers.get("x-api-key")?.trim() ?? null;
}

export async function authenticateApiKey(request: Request): Promise<ApiKeyAuth> {
  const raw = parseApiKeyFromRequest(request);
  if (!raw || !raw.startsWith(API_KEY_PREFIX)) {
    throw new ServerError("Valid API key required.", "UNAUTHORIZED");
  }
  const hash = hashApiKey(raw);
  const row = await getPrisma().tenantApiKey.findFirst({
    where: { keyHash: hash, active: true },
  });
  if (!row) throw new ServerError("Invalid API key.", "UNAUTHORIZED");
  const scopes = Array.isArray(row.scopes) ? (row.scopes as string[]) : [];
  await getPrisma().tenantApiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });
  return { tenantId: row.tenantId, keyId: row.id, scopes };
}

export function requireApiScope(auth: ApiKeyAuth, scope: string): void {
  if (!auth.scopes.includes(scope) && !auth.scopes.includes("*")) {
    throw new ServerError(`API key missing scope: ${scope}.`, "FORBIDDEN");
  }
}

export function tenantContextFromApiKey(auth: ApiKeyAuth): TenantContext {
  const canWrite = auth.scopes.includes("production.write") || auth.scopes.includes("*");
  return {
    tenantId: auth.tenantId,
    userId: null,
    role: canWrite ? "OPERATIONS" : "VIEWER",
  };
}
