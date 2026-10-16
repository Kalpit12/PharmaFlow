import {
  DEMO_TENANT_BRAND,
  DEMO_TENANT_COUNTRY,
  DEMO_TENANT_LEGAL_NAME,
  DEMO_TENANT_SLUG,
  DEMO_TENANT_TAGLINE,
  LAB_ALLIED_DEMO_BRAND,
  LAB_ALLIED_DEMO_COUNTRY,
  LAB_ALLIED_DEMO_LEGAL_NAME,
  LAB_ALLIED_DEMO_SLUG,
  LAB_ALLIED_DEMO_TAGLINE,
} from "@/lib/demo-tenant";
import type { TenantConfig } from "@/lib/tenant";

export const DEMO_TENANT_SLUG_COOKIE = "pharmora_demo_tenant_slug";

/** Demo tenants that may be selected via the workspace switcher (server-enforced). */
export const SWITCHABLE_DEMO_TENANT_SLUGS = [DEMO_TENANT_SLUG, LAB_ALLIED_DEMO_SLUG] as const;

export type SwitchableDemoTenantSlug = (typeof SWITCHABLE_DEMO_TENANT_SLUGS)[number];

export function isSwitchableDemoTenantSlug(value: string): value is SwitchableDemoTenantSlug {
  return (SWITCHABLE_DEMO_TENANT_SLUGS as readonly string[]).includes(value);
}

export const demoWorkspaces: TenantConfig[] = [
  {
    id: DEMO_TENANT_SLUG,
    legalName: DEMO_TENANT_LEGAL_NAME,
    brand: DEMO_TENANT_BRAND,
    tagline: DEMO_TENANT_TAGLINE,
    country: DEMO_TENANT_COUNTRY,
  },
  {
    id: LAB_ALLIED_DEMO_SLUG,
    legalName: LAB_ALLIED_DEMO_LEGAL_NAME,
    brand: LAB_ALLIED_DEMO_BRAND,
    tagline: LAB_ALLIED_DEMO_TAGLINE,
    country: LAB_ALLIED_DEMO_COUNTRY,
  },
];
