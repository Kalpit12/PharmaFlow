import type { PlannerAccessRole, UserRole } from "@prisma/client";

import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";

export type PlannerAccessProfile = {
  plannerRole: PlannerAccessRole;
  plantDepartmentId: string | null;
  canGlobalRules: boolean;
  canProposeSchedule: boolean;
  canExecuteShopFloor: boolean;
  readOnlyPlanner: boolean;
  scopedWorkstationIds: string[] | null;
};

export function mapUserRoleToPlannerRole(role: UserRole | null): PlannerAccessRole {
  switch (role) {
    case "OPERATOR":
      return "OPERATOR";
    case "QUALITY":
      return "QA";
    case "SALES":
      return "SALES";
    case "VIEWER":
      return "EXECUTIVE";
    case "MANAGER":
    case "ADMIN":
      return "HEAD_PLANNER";
    case "OPERATIONS":
    default:
      return "PLANNER";
  }
}

export function plannerRoleCapabilities(plannerRole: PlannerAccessRole): Omit<
  PlannerAccessProfile,
  "plannerRole" | "plantDepartmentId" | "scopedWorkstationIds"
> {
  switch (plannerRole) {
    case "OPERATOR":
      return {
        canGlobalRules: false,
        canProposeSchedule: false,
        canExecuteShopFloor: true,
        readOnlyPlanner: true,
      };
    case "SUPERVISOR":
      return {
        canGlobalRules: false,
        canProposeSchedule: false,
        canExecuteShopFloor: true,
        readOnlyPlanner: false,
      };
    case "PLANNER":
      return {
        canGlobalRules: false,
        canProposeSchedule: true,
        canExecuteShopFloor: false,
        readOnlyPlanner: false,
      };
    case "HEAD_PLANNER":
      return {
        canGlobalRules: true,
        canProposeSchedule: true,
        canExecuteShopFloor: false,
        readOnlyPlanner: false,
      };
    case "QA":
      return {
        canGlobalRules: false,
        canProposeSchedule: false,
        canExecuteShopFloor: false,
        readOnlyPlanner: true,
      };
    case "SALES":
      return {
        canGlobalRules: false,
        canProposeSchedule: false,
        canExecuteShopFloor: false,
        readOnlyPlanner: true,
      };
    case "EXECUTIVE":
      return {
        canGlobalRules: false,
        canProposeSchedule: false,
        canExecuteShopFloor: false,
        readOnlyPlanner: true,
      };
  }
}

export function departmentScopedRoles(plannerRole: PlannerAccessRole): boolean {
  return plannerRole === "OPERATOR" || plannerRole === "SUPERVISOR";
}

export async function resolvePlannerAccess(ctx: TenantContext): Promise<PlannerAccessProfile> {
  const userId = ctx.userId;
  if (!userId) {
    const fallback = mapUserRoleToPlannerRole((ctx.role as UserRole) ?? null);
    return {
      plannerRole: fallback,
      plantDepartmentId: null,
      scopedWorkstationIds: null,
      ...plannerRoleCapabilities(fallback),
    };
  }

  const user = await getPrisma().user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId },
    select: { role: true, plannerAccessRole: true, plantDepartmentId: true },
  });
  const plannerRole = user?.plannerAccessRole ?? mapUserRoleToPlannerRole(user?.role ?? null);
  const caps = plannerRoleCapabilities(plannerRole);
  const departmentId = user?.plantDepartmentId ?? null;

  let scopedWorkstationIds: string[] | null = null;
  if (departmentId && departmentScopedRoles(plannerRole)) {
    const rows = await getPrisma().workstation.findMany({
      where: { tenantId: ctx.tenantId, departmentId, active: true },
      select: { id: true },
    });
    scopedWorkstationIds = rows.map((row) => row.id);
  }

  return {
    plannerRole,
    plantDepartmentId: departmentId,
    scopedWorkstationIds,
    ...caps,
  };
}

export function canGlobalRules(ctx: TenantContext): boolean {
  return hasPermission(ctx.role, "production.global_rules");
}

export function canProposeSchedule(ctx: TenantContext, access?: PlannerAccessProfile): boolean {
  if (access && !access.canProposeSchedule) return false;
  return hasPermission(ctx.role, "production.schedule");
}

export function assertPlannerPermission(ctx: TenantContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new Error("FORBIDDEN");
  }
}
