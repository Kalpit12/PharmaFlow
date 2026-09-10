export type TenantConfig = {
  id: string;
  legalName: string;
  brand: string;
  tagline: string;
  country: string;
};

/** Demo tenant only. UI must read this config — do not hard-code LabAllied in components. */
export const demoTenant: TenantConfig = {
  id: "lab-allied",
  legalName: "Laboratory & Allied Limited",
  brand: "Laboratory & Allied",
  tagline: "Better Medicine Better Life",
  country: "Kenya",
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
