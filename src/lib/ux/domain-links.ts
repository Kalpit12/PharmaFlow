/**
 * Cross-domain relationships for Phase 27 Command UX.
 * Links only to routes that exist — no fake destinations.
 */

export type DomainLink = {
  label: string;
  href: string;
};

/** Related workspaces shown as a compact trail under page headers. */
export const DOMAIN_TRAILS: Record<string, DomainLink[]> = {
  "/command-center": [
    { label: "Daily Review", href: "/daily-review" },
    { label: "Reports", href: "/reports" },
    { label: "Execution", href: "/execution" },
  ],
  "/daily-review": [
    { label: "Command Center", href: "/command-center" },
    { label: "Reports", href: "/reports" },
    { label: "Forecast", href: "/forecast" },
  ],
  "/dashboard": [
    { label: "Command Center", href: "/command-center" },
    { label: "Reports", href: "/reports" },
  ],
  "/reports": [
    { label: "Command Center", href: "/command-center" },
    { label: "Operations", href: "/operations" },
    { label: "Forecast", href: "/forecast" },
  ],
  "/operations": [
    { label: "Materials", href: "/materials" },
    { label: "Inventory", href: "/inventory" },
    { label: "Command Center", href: "/command-center" },
  ],
  "/materials": [
    { label: "Operations", href: "/operations" },
    { label: "Procurement", href: "/procurement" },
    { label: "Inventory", href: "/inventory" },
  ],
  "/inventory": [
    { label: "Materials", href: "/materials" },
    { label: "Receiving", href: "/receiving" },
    { label: "Expiry", href: "/inventory/expiry" },
  ],
  "/procurement": [
    { label: "Materials", href: "/materials" },
    { label: "RFQs", href: "/rfqs" },
    { label: "Purchase Orders", href: "/purchase-orders" },
  ],
  "/rfqs": [
    { label: "Procurement", href: "/procurement" },
    { label: "Suppliers", href: "/suppliers" },
    { label: "Purchase Orders", href: "/purchase-orders" },
  ],
  "/purchase-orders": [
    { label: "RFQs", href: "/rfqs" },
    { label: "Receiving", href: "/receiving" },
    { label: "Suppliers", href: "/suppliers" },
  ],
  "/receiving": [
    { label: "Purchase Orders", href: "/purchase-orders" },
    { label: "Inventory", href: "/inventory" },
    { label: "Supplier Performance", href: "/supplier-performance" },
  ],
  "/suppliers": [
    { label: "Supplier Performance", href: "/supplier-performance" },
    { label: "RFQs", href: "/rfqs" },
    { label: "Procurement", href: "/procurement" },
  ],
  "/supplier-performance": [
    { label: "Suppliers", href: "/suppliers" },
    { label: "Receiving", href: "/receiving" },
    { label: "Purchase Orders", href: "/purchase-orders" },
  ],
  "/forecast": [
    { label: "Command Center", href: "/command-center" },
    { label: "Scenarios", href: "/scenarios" },
    { label: "Reports", href: "/reports" },
  ],
  "/scenarios": [
    { label: "Forecast", href: "/forecast" },
    { label: "Command Center", href: "/command-center" },
    { label: "Operations", href: "/operations" },
  ],
  "/execution": [
    { label: "Command Center", href: "/command-center" },
    { label: "Approvals", href: "/approvals" },
  ],
  "/ai": [
    { label: "Command Center", href: "/command-center" },
    { label: "Reports", href: "/reports" },
  ],
};

export function trailForPath(pathname: string): DomainLink[] {
  if (DOMAIN_TRAILS[pathname]) return DOMAIN_TRAILS[pathname];
  const base = Object.keys(DOMAIN_TRAILS)
    .filter((key) => key !== "/" && pathname.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];
  return base ? DOMAIN_TRAILS[base] : [];
}

/** Procurement-chain crumbs for detail surfaces. */
export function procurementChainCrumbs(leaf: { label: string; href?: string }): Array<{ label: string; href?: string }> {
  return [
    { label: "Procurement", href: "/procurement" },
    { label: "RFQs", href: "/rfqs" },
    { label: "Purchase Orders", href: "/purchase-orders" },
    { label: "Receiving", href: "/receiving" },
    leaf,
  ];
}
