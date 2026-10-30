import { resolvePlannerAccess } from "@/lib/auth/planner-access";
import { plantYmd } from "@/lib/operations/plant-time";
import type { ProductionExecutionSnapshot } from "@/lib/production-execution/types";
import { getPrisma } from "@/lib/server/db";
import type { TenantContext } from "@/lib/server/errors";
import { getProductionExecutionSnapshot, resolveProductionExecutionFilters } from "@/lib/server/production-execution";

export type ShopFloorBoardStation = {
  id: string;
  name: string;
  code: string;
  department: string;
  /** Today's calendar exception that removes capacity (breakdown, maintenance), if any. */
  exceptionReason: string | null;
  exceptionClosed: boolean;
};

export type ShopFloorBoardSnapshot = {
  asOf: string;
  execution: ProductionExecutionSnapshot;
  stations: ShopFloorBoardStation[];
};

/** Read-only live board (TV mode): every active station grouped by department. No writes, no model calls. */
export async function getShopFloorBoardSnapshot(ctx: TenantContext): Promise<ShopFloorBoardSnapshot> {
  const execution = await getProductionExecutionSnapshot(ctx, resolveProductionExecutionFilters({}), {
    includeMaterials: false,
  });
  const access = await resolvePlannerAccess(ctx);
  const prisma = getPrisma();
  const today = new Date(`${plantYmd(new Date())}T00:00:00.000Z`);
  const workstations = await prisma.workstation.findMany({
    where: {
      tenantId: ctx.tenantId,
      active: true,
      ...(access.scopedWorkstationIds?.length ? { id: { in: access.scopedWorkstationIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      code: true,
      department: { select: { name: true } },
      calendarExceptions: { where: { date: today }, select: { reason: true, closed: true, startMinute: true } },
    },
    orderBy: [{ name: "asc" }],
  });
  return {
    asOf: new Date().toISOString(),
    execution,
    stations: workstations.map((row) => {
      const exception = row.calendarExceptions[0] ?? null;
      return {
        id: row.id,
        name: row.name,
        code: row.code,
        department: row.department?.name ?? "Plant",
        exceptionReason: exception?.reason ?? null,
        exceptionClosed: Boolean(exception?.closed),
      };
    }),
  };
}
