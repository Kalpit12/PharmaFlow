import type { PlannerWidgetType } from "@prisma/client";

import { DEFAULT_DASHBOARD_WIDGETS, reorderWidgetTypes } from "@/lib/operations/planner-widgets";
import { requirePermission } from "@/lib/auth/authorization";
import { resolvePlannerAccess } from "@/lib/auth/planner-access";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { ServerError } from "@/lib/server/errors";
import { getOperationsDashboardSnapshot, type OperationsDashboardSnapshot } from "@/lib/server/operations-dashboard";

export type PlannerDashboardView = {
  id: string;
  name: string;
  isDefault: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  widgets: PlannerWidgetType[];
};

export type PlannerDashboardPageData = {
  dashboards: PlannerDashboardView[];
  active: PlannerDashboardView;
  snapshot: OperationsDashboardSnapshot;
  canEdit: boolean;
};

function mapDashboard(row: {
  id: string;
  name: string;
  isDefault: boolean;
  dateFrom: Date | null;
  dateTo: Date | null;
  widgets: Array<{ widgetType: PlannerWidgetType; sortOrder: number }>;
}): PlannerDashboardView {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    dateFrom: row.dateFrom?.toISOString() ?? null,
    dateTo: row.dateTo?.toISOString() ?? null,
    widgets: row.widgets.sort((a, b) => a.sortOrder - b.sortOrder).map((w) => w.widgetType),
  };
}

async function loadDashboard(ctx: TenantContext, dashboardId: string) {
  const prisma = getPrisma();
  const userId = ctx.userId;
  if (!userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  const row = await prisma.plannerDashboard.findFirst({
    where: { id: dashboardId, tenantId: ctx.tenantId, userId },
    include: { widgets: true },
  });
  if (!row) throw new ServerError("Dashboard not found.", "NOT_FOUND");
  return row;
}

export async function ensureDefaultPlannerDashboard(ctx: TenantContext): Promise<PlannerDashboardView> {
  const prisma = getPrisma();
  const userId = ctx.userId;
  if (!userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");

  const existing = await prisma.plannerDashboard.findFirst({
    where: { tenantId: ctx.tenantId, userId, isDefault: true },
    include: { widgets: true },
  });
  if (existing) return mapDashboard(existing);

  const created = await prisma.plannerDashboard.create({
    data: {
      tenantId: ctx.tenantId,
      userId,
      name: "Production overview",
      isDefault: true,
      widgets: {
        create: DEFAULT_DASHBOARD_WIDGETS.map((widgetType, index) => ({
          widgetType,
          sortOrder: index,
        })),
      },
    },
    include: { widgets: true },
  });
  return mapDashboard(created);
}

export async function listPlannerDashboards(ctx: TenantContext): Promise<PlannerDashboardView[]> {
  requirePermission(ctx, "production.read");
  await ensureDefaultPlannerDashboard(ctx);
  const userId = ctx.userId;
  if (!userId) return [];
  const rows = await getPrisma().plannerDashboard.findMany({
    where: { tenantId: ctx.tenantId, userId },
    include: { widgets: true },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(mapDashboard);
}

export async function getPlannerDashboardPageData(
  ctx: TenantContext,
  dashboardId?: string | null
): Promise<PlannerDashboardPageData> {
  requirePermission(ctx, "production.read");
  const access = await resolvePlannerAccess(ctx);
  const dashboards = await listPlannerDashboards(ctx);
  const active =
    dashboards.find((row) => row.id === dashboardId) ??
    dashboards.find((row) => row.isDefault) ??
    dashboards[0]!;
  const from = active.dateFrom ? new Date(active.dateFrom) : null;
  const to = active.dateTo ? new Date(active.dateTo) : null;
  const snapshot = await getOperationsDashboardSnapshot(ctx, {
    from,
    to,
    scopedWorkstationIds: access.scopedWorkstationIds,
  });
  const canEdit = !access.readOnlyPlanner && Boolean(ctx.userId);
  return { dashboards, active, snapshot, canEdit };
}

export async function createPlannerDashboard(
  ctx: TenantContext,
  input: { name: string; cloneFromId?: string | null }
): Promise<PlannerDashboardView> {
  requirePermission(ctx, "production.read");
  const userId = ctx.userId;
  if (!userId) throw new ServerError("Authentication required.", "UNAUTHORIZED");
  const prisma = getPrisma();
  let widgets = DEFAULT_DASHBOARD_WIDGETS;
  if (input.cloneFromId) {
    const sourceRow = await prisma.plannerDashboard.findFirst({
      where: { id: input.cloneFromId, tenantId: ctx.tenantId, userId },
      include: { widgets: true },
    });
    if (sourceRow) {
      widgets = sourceRow.widgets.sort((a, b) => a.sortOrder - b.sortOrder).map((w) => w.widgetType);
    }
  }
  const created = await prisma.plannerDashboard.create({
    data: {
      tenantId: ctx.tenantId,
      userId,
      name: input.name.trim() || "New dashboard",
      isDefault: false,
      widgets: {
        create: widgets.map((widgetType, sortOrder) => ({ widgetType, sortOrder })),
      },
    },
    include: { widgets: true },
  });
  return mapDashboard(created);
}

export async function updatePlannerDashboard(
  ctx: TenantContext,
  dashboardId: string,
  input: {
    name?: string;
    dateFrom?: string | null;
    dateTo?: string | null;
    widgets?: PlannerWidgetType[];
    isDefault?: boolean;
  }
): Promise<PlannerDashboardView> {
  const row = await loadDashboard(ctx, dashboardId);
  const prisma = getPrisma();
  const userId = ctx.userId!;

  if (input.isDefault) {
    await prisma.plannerDashboard.updateMany({
      where: { tenantId: ctx.tenantId, userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  await prisma.plannerDashboard.update({
    where: { id: row.id },
    data: {
      name: input.name?.trim() || undefined,
      isDefault: input.isDefault ?? undefined,
      dateFrom: input.dateFrom === undefined ? undefined : input.dateFrom ? new Date(input.dateFrom) : null,
      dateTo: input.dateTo === undefined ? undefined : input.dateTo ? new Date(input.dateTo) : null,
    },
  });

  if (input.widgets) {
    const current = row.widgets.map((w) => w.widgetType);
    const ordered = reorderWidgetTypes(current, input.widgets);
    const merged = [...new Set([...ordered, ...input.widgets.filter((t) => !current.includes(t))])];
    await prisma.$transaction(async (tx) => {
      await tx.plannerDashboardWidget.deleteMany({ where: { dashboardId: row.id } });
      await tx.plannerDashboardWidget.createMany({
        data: merged.map((widgetType, sortOrder) => ({
          dashboardId: row.id,
          widgetType,
          sortOrder,
        })),
      });
    });
  }

  const refreshed = await prisma.plannerDashboard.findFirst({
    where: { id: row.id },
    include: { widgets: true },
  });
  return mapDashboard(refreshed!);
}

export async function deletePlannerDashboard(ctx: TenantContext, dashboardId: string): Promise<void> {
  const row = await loadDashboard(ctx, dashboardId);
  if (row.isDefault) throw new ServerError("Cannot delete the default dashboard.", "INTERNAL");
  await getPrisma().plannerDashboard.delete({ where: { id: row.id } });
}

export async function exportPlannerDashboardSnapshot(
  ctx: TenantContext,
  dashboardId: string
): Promise<{ snapshot: OperationsDashboardSnapshot; title: string }> {
  const row = await loadDashboard(ctx, dashboardId);
  const access = await resolvePlannerAccess(ctx);
  const snapshot = await getOperationsDashboardSnapshot(ctx, {
    from: row.dateFrom,
    to: row.dateTo,
    scopedWorkstationIds: access.scopedWorkstationIds,
  });
  return { snapshot, title: row.name };
}
