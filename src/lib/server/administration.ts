import { can, requirePermission } from "@/lib/auth/authorization";
import { ROLE_LABEL } from "@/lib/auth/identity";
import type { AdministrationReadiness, AdministrationSnapshot } from "@/lib/administration/types";
import { getPrisma } from "@/lib/server/db";
import { ServerError, type TenantContext } from "@/lib/server/errors";

export async function getAdministrationSnapshot(ctx: TenantContext): Promise<AdministrationSnapshot> {
  requirePermission(ctx, "users.read");
  const prisma = getPrisma();

  const [
    tenant,
    users,
    workstations,
    warehouses,
    regions,
    productCount,
    customerCount,
    supplierCount,
    inventoryLotCount,
    auditCount,
  ] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, slug: true, status: true, createdAt: true, updatedAt: true },
    }),
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.workstation.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, code: true, capacityHoursPerDay: true, active: true },
      orderBy: [{ active: "desc" }, { code: "asc" }],
    }),
    prisma.warehouse.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, code: true, _count: { select: { lots: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.region.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true, code: true, country: true, _count: { select: { customers: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.product.count({ where: { tenantId: ctx.tenantId } }),
    prisma.customer.count({ where: { tenantId: ctx.tenantId } }),
    prisma.supplier.count({ where: { tenantId: ctx.tenantId } }),
    prisma.inventoryLot.count({ where: { tenantId: ctx.tenantId } }),
    prisma.auditLog.count({ where: { tenantId: ctx.tenantId } }),
  ]);

  if (!tenant) throw new ServerError("Workspace not found.", "NOT_FOUND");

  const activeUsers = users.filter((user) => user.status === "ACTIVE").length;
  const activeWorkstations = workstations.filter((workstation) => workstation.active).length;

  const readiness: AdministrationReadiness[] = [
    {
      id: "identity",
      label: "Workspace identity",
      detail: `${tenant.name} · ${tenant.slug}`,
      state: tenant.name && tenant.slug ? "READY" : "REVIEW",
    },
    {
      id: "access",
      label: "User access",
      detail: activeUsers > 0 ? `${activeUsers} active ${activeUsers === 1 ? "user" : "users"}` : "No active users",
      state: activeUsers > 0 ? "READY" : "REVIEW",
      href: "/governance",
    },
    {
      id: "plant",
      label: "Production resources",
      detail: activeWorkstations > 0 ? `${activeWorkstations} active workstations` : "No active workstations",
      state: activeWorkstations > 0 ? "READY" : "REVIEW",
      href: "/operations",
    },
    {
      id: "inventory",
      label: "Inventory network",
      detail: warehouses.length > 0 ? `${warehouses.length} warehouses · ${inventoryLotCount} lots` : "No warehouses configured",
      state: warehouses.length > 0 ? "READY" : "REVIEW",
      href: "/inventory",
    },
    {
      id: "commercial",
      label: "Commercial foundation",
      detail: `${productCount} products · ${customerCount} customers`,
      state: productCount > 0 && customerCount > 0 ? "READY" : "REVIEW",
      href: "/dashboard",
    },
    {
      id: "audit",
      label: "Accountability trail",
      detail: auditCount > 0 ? `${auditCount} audit records` : "No audit records yet",
      state: auditCount > 0 ? "READY" : "REVIEW",
      href: "/governance",
    },
  ];

  const currentUser = users.find((user) => user.id === ctx.userId);

  return {
    tenant: {
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
    },
    currentUser: {
      name: currentUser?.name ?? "Workspace user",
      email: currentUser?.email ?? "",
      roleLabel: currentUser ? ROLE_LABEL[currentUser.role] : "Unknown",
    },
    counts: {
      users: users.length,
      activeUsers,
      products: productCount,
      customers: customerCount,
      suppliers: supplierCount,
      workstations: workstations.length,
      warehouses: warehouses.length,
      inventoryLots: inventoryLotCount,
    },
    users: users.map((user) => ({
      ...user,
      roleLabel: ROLE_LABEL[user.role],
      createdAt: user.createdAt.toISOString(),
    })),
    workstations,
    warehouses: warehouses.map(({ _count, ...warehouse }) => ({ ...warehouse, lotCount: _count.lots })),
    regions: regions.map(({ _count, ...region }) => ({ ...region, customerCount: _count.customers })),
    readiness,
    canViewGovernance: can(ctx.role, "governance.read"),
    canManageUsers: can(ctx.role, "users.manage"),
    disclaimer: "Tenant-scoped administration. Authentication, permissions and mutations remain server-authoritative.",
  };
}
