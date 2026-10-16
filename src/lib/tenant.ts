import { DEMO_TENANT_SLUG } from "@/lib/demo-tenant";
import { demoWorkspaces } from "@/lib/demo-workspaces";

export type TenantConfig = {
  id: string;
  legalName: string;
  brand: string;
  tagline: string;
  country: string;
};

/** Default workspace (MediCrest generic demo). */
export const demoTenant: TenantConfig = demoWorkspaces[0]!;

export const workspaces: TenantConfig[] = demoWorkspaces;

export function getTenant(): TenantConfig {
  return demoTenant;
}

export function getWorkspaces(): TenantConfig[] {
  return workspaces;
}

export function getWorkspaceById(id: string): TenantConfig {
  return workspaces.find((workspace) => workspace.id === id) ?? demoTenant;
}
