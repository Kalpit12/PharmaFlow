import type { TenantStatus, UserRole, UserStatus } from "@prisma/client";

export type AdministrationUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  status: UserStatus;
  createdAt: string;
};

export type AdministrationWorkstation = {
  id: string;
  name: string;
  code: string;
  capacityHoursPerDay: number;
  active: boolean;
};

export type AdministrationWarehouse = {
  id: string;
  name: string;
  code: string;
  lotCount: number;
};

export type AdministrationRegion = {
  id: string;
  name: string;
  code: string;
  country: string;
  customerCount: number;
};

export type AdministrationReadiness = {
  id: string;
  label: string;
  detail: string;
  state: "READY" | "REVIEW";
  href?: string;
};

export type AdministrationSnapshot = {
  tenant: {
    name: string;
    slug: string;
    status: TenantStatus;
    createdAt: string;
    updatedAt: string;
  };
  currentUser: {
    name: string;
    email: string;
    roleLabel: string;
  };
  counts: {
    users: number;
    activeUsers: number;
    products: number;
    customers: number;
    suppliers: number;
    workstations: number;
    warehouses: number;
    inventoryLots: number;
  };
  users: AdministrationUser[];
  workstations: AdministrationWorkstation[];
  warehouses: AdministrationWarehouse[];
  regions: AdministrationRegion[];
  readiness: AdministrationReadiness[];
  canViewGovernance: boolean;
  canManageUsers: boolean;
  disclaimer: string;
};
