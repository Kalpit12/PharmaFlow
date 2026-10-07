/** Workspace routes that require a session (used by proxy matcher + redirect logic). */
export const PROTECTED_ROUTE_ROOTS = [
  "dashboard",
  "ai",
  "app-preview",
  "approvals",
  "communications",
  "operations",
  "reports",
  "inventory",
  "materials",
  "procurement",
  "suppliers",
  "daily-review",
  "execution",
  "command-center",
  "forecast",
  "scenarios",
  "rfqs",
  "purchase-orders",
  "receiving",
  "supplier-performance",
  "batches",
  "quality",
  "traceability",
  "governance",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTE_ROOTS.some((root) => pathname === `/${root}` || pathname.startsWith(`/${root}/`));
}
