import {
  DEMO_TENANT_BRAND,
  DEMO_TENANT_COUNTRY,
  DEMO_TENANT_LEGAL_NAME,
  DEMO_TENANT_SLUG,
  DEMO_TENANT_TAGLINE,
} from "@/lib/demo-tenant";

export type TenantConfig = {
  id: string;
  legalName: string;
  brand: string;
  tagline: string;
  country: string;
};

/** Demo tenant only. UI must read this config — do not hard-code the demo company in components. */
export const demoTenant: TenantConfig = {
  id: DEMO_TENANT_SLUG,
  legalName: DEMO_TENANT_LEGAL_NAME,
  brand: DEMO_TENANT_BRAND,
  tagline: DEMO_TENANT_TAGLINE,
  country: DEMO_TENANT_COUNTRY,
};

export const workspaces: TenantConfig[] = [
  demoTenant,
  {
    id: "demo-pharma",
    legalName: "Demo Pharmaceutical Co.",
    brand: "Demo Pharmaceutical Co.",
    tagline: "Quality medicines, reliably supplied",
    country: "United Kingdom",
  },
  {
    id: "pharmora-demo",
    legalName: "Pharmaflow Demo",
    brand: "Pharmaflow Demo",
    tagline: "Sandbox workspace",
    country: "Kenya",
  },
];

export function getTenant(): TenantConfig {
  return demoTenant;
}

export function getWorkspaces(): TenantConfig[] {
  return workspaces;
}

export function getWorkspaceById(id: string): TenantConfig {
  return workspaces.find((workspace) => workspace.id === id) ?? demoTenant;
}
