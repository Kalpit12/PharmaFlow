import type { Session } from "next-auth";

type WorkspaceIdentity = {
  id?: unknown;
  email?: unknown;
  tenantId?: unknown;
  role?: unknown;
};

function resolveEmail(token: WorkspaceIdentity): string | null {
  if (typeof token.email === "string" && token.email.length > 0) return token.email;
  return null;
}

/** JWT payload or session user — same fields the app requires server-side. */
export function isWorkspaceToken(token: WorkspaceIdentity | null | undefined): boolean {
  const email = token ? resolveEmail(token) : null;
  return (
    typeof token?.id === "string" &&
    !!email &&
    typeof token?.tenantId === "string" &&
    typeof token?.role === "string"
  );
}

/** Session is usable for workspace routes (matches server tenant context checks). */
export function isWorkspaceSession(session: Session | null | undefined): boolean {
  const user = session?.user;
  if (!user) return false;
  return isWorkspaceToken({
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
  });
}
