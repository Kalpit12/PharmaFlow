import type { UserRole } from "@prisma/client";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  role: UserRole;
};

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Administrator",
  MANAGER: "Operations Manager",
  OPERATIONS: "Operations",
  OPERATOR: "Operator",
  PROCUREMENT: "Procurement",
  QUALITY: "Quality",
  SALES: "Sales",
  VIEWER: "Viewer",
};

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function isTenantAccessible(status: "DEMO" | "ACTIVE" | "SUSPENDED"): boolean {
  return status === "DEMO" || status === "ACTIVE";
}
