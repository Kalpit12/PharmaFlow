import type { UserRole } from "@prisma/client";

export type Permission =
  | "dashboard.read"
  | "reports.read"
  | "command_center.read"
  | "production.read"
  | "production.schedule"
  | "production.execute"
  | "inventory.read"
  | "inventory.receive"
  | "materials.read"
  | "procurement.read"
  | "procurement.create"
  | "procurement.approve"
  | "suppliers.read"
  | "sales.read"
  | "sales.manage"
  | "batches.read"
  | "batches.quality_action"
  | "traceability.read"
  | "quality.read"
  | "quality.manage"
  | "communications.read"
  | "communications.create"
  | "actions.read"
  | "actions.approve"
  | "users.read"
  | "users.manage"
  | "audit.read"
  | "governance.read";

export const ALL_PERMISSIONS: Permission[] = [
  "dashboard.read",
  "reports.read",
  "command_center.read",
  "production.read",
  "production.schedule",
  "production.execute",
  "inventory.read",
  "inventory.receive",
  "materials.read",
  "procurement.read",
  "procurement.create",
  "procurement.approve",
  "suppliers.read",
  "sales.read",
  "sales.manage",
  "batches.read",
  "batches.quality_action",
  "traceability.read",
  "quality.read",
  "quality.manage",
  "communications.read",
  "communications.create",
  "actions.read",
  "actions.approve",
  "users.read",
  "users.manage",
  "audit.read",
  "governance.read",
];

const READ_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter((permission) => permission.endsWith(".read"));

const OPERATIONS_PERMISSIONS: Permission[] = [
  "dashboard.read",
  "reports.read",
  "command_center.read",
  "production.read",
  "production.schedule",
  "production.execute",
  "materials.read",
  "inventory.read",
  "batches.read",
  "traceability.read",
  "quality.read",
  "procurement.read",
  "suppliers.read",
];

const PROCUREMENT_PERMISSIONS: Permission[] = [
  "dashboard.read",
  "reports.read",
  "procurement.read",
  "procurement.create",
  "suppliers.read",
  "inventory.read",
  "inventory.receive",
  "materials.read",
];

const QUALITY_PERMISSIONS: Permission[] = [
  "dashboard.read",
  "reports.read",
  "quality.read",
  "quality.manage",
  "batches.read",
  "batches.quality_action",
  "traceability.read",
  "production.read",
  "materials.read",
];

const SALES_PERMISSIONS: Permission[] = [
  "dashboard.read",
  "reports.read",
  "command_center.read",
  "sales.read",
  "sales.manage",
  "communications.read",
  "communications.create",
  "actions.read",
];

const VIEWER_PERMISSIONS: Permission[] = [
  "dashboard.read",
  "reports.read",
  "command_center.read",
  "production.read",
  "inventory.read",
  "materials.read",
  "procurement.read",
  "suppliers.read",
  "sales.read",
  "batches.read",
  "traceability.read",
  "quality.read",
  "communications.read",
  "actions.read",
];

const MANAGER_PERMISSIONS: Permission[] = [
  ...READ_PERMISSIONS.filter((permission) => permission !== "users.manage"),
  "production.schedule",
  "production.execute",
  "inventory.receive",
  "procurement.create",
  "procurement.approve",
  "sales.manage",
  "batches.quality_action",
  "quality.manage",
  "communications.create",
  "actions.approve",
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  OPERATIONS: OPERATIONS_PERMISSIONS,
  OPERATOR: OPERATIONS_PERMISSIONS,
  PROCUREMENT: PROCUREMENT_PERMISSIONS,
  QUALITY: QUALITY_PERMISSIONS,
  SALES: SALES_PERMISSIONS,
  VIEWER: VIEWER_PERMISSIONS,
};

export const APPROVAL_AUTHORITY: Array<{ capability: string; permission: Permission; roles: UserRole[] }> = [
  { capability: "Action approval", permission: "actions.approve", roles: ["ADMIN", "MANAGER"] },
  { capability: "Procurement approval", permission: "procurement.approve", roles: ["ADMIN", "MANAGER"] },
  { capability: "Quality decisions", permission: "quality.manage", roles: ["ADMIN", "MANAGER", "QUALITY"] },
  { capability: "Batch quality actions", permission: "batches.quality_action", roles: ["ADMIN", "MANAGER", "QUALITY"] },
  { capability: "User administration", permission: "users.manage", roles: ["ADMIN"] },
];

export function resolveRoleForPermissions(role: string | null): UserRole | null {
  if (!role) return null;
  if (role === "OPERATOR") return "OPERATIONS";
  if (role in ROLE_PERMISSIONS) return role as UserRole;
  return null;
}

export function hasPermission(role: string | null, permission: Permission): boolean {
  const resolved = resolveRoleForPermissions(role);
  if (!resolved) return false;
  return ROLE_PERMISSIONS[resolved].includes(permission);
}

export function permissionsForRole(role: string | null): Permission[] {
  const resolved = resolveRoleForPermissions(role);
  if (!resolved) return [];
  return [...new Set(ROLE_PERMISSIONS[resolved])];
}

export function navPermissionForHref(href: string): Permission | null {
  if (href === "/governance") return "governance.read";
  if (href === "/command-center") return "command_center.read";
  if (href === "/execution/production" || href.startsWith("/execution/production")) return "production.read";
  if (href === "/dashboard" || href === "/daily-review" || href === "/execution") return "dashboard.read";
  if (href === "/reports") return "reports.read";
  if (href === "/operations") return "production.read";
  if (href === "/batches") return "batches.read";
  if (href === "/quality") return "quality.read";
  if (href === "/traceability") return "traceability.read";
  if (href === "/materials") return "materials.read";
  if (href === "/inventory") return "inventory.read";
  if (href.startsWith("/procurement") || href === "/rfqs" || href === "/purchase-orders" || href === "/receiving") {
    return "procurement.read";
  }
  if (href === "/suppliers" || href === "/supplier-performance") return "suppliers.read";
  if (href === "/approvals") return "actions.read";
  if (href === "/communications") return "communications.read";
  if (href === "/ai" || href === "/forecast" || href === "/scenarios") return "dashboard.read";
  return null;
}
