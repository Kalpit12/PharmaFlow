export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: NavIconName;
  comingSoon?: boolean;
  phase?: string;
};

export type NavSection = {
  id: string;
  label?: string;
  items: NavItem[];
};

export type NavIconName =
  | "layout-dashboard"
  | "sparkles"
  | "user-plus"
  | "building-2"
  | "inbox"
  | "file-text"
  | "shopping-bag"
  | "package"
  | "microscope"
  | "folder"
  | "chart-column"
  | "warehouse"
  | "factory"
  | "shield-check"
  | "mail"
  | "users"
  | "settings"
  | "clipboard-list";

/**
 * Phase 27 — grouped operating-system navigation.
 * Only routes that exist. Command Center is the primary surface.
 */
export const navSections: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { id: "command-center", label: "Command Center", href: "/command-center", icon: "chart-column", phase: "Phase 19" },
      { id: "daily-review", label: "Daily Review", href: "/daily-review", icon: "clipboard-list", phase: "Phase 17" },
      { id: "overview", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", phase: "Phase 4" },
      { id: "execution", label: "Execution", href: "/execution", icon: "shield-check", phase: "Phase 18" },
    ],
  },
  {
    id: "commercial",
    label: "Commercial",
    items: [
      { id: "reports", label: "Reports", href: "/reports", icon: "chart-column", phase: "Phase 26" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { id: "operations-planner", label: "Operations", href: "/operations", icon: "factory", phase: "Phase 12.5" },
      { id: "production-execution", label: "Production Execution", href: "/execution/production", icon: "factory", phase: "Phase 28" },
      { id: "batches", label: "Batches", href: "/batches", icon: "microscope", phase: "Phase 33" },
      { id: "quality", label: "Quality", href: "/quality", icon: "file-text", phase: "Phase 35" },
      { id: "traceability", label: "Traceability", href: "/traceability", icon: "shield-check", phase: "Phase 34" },
      { id: "materials", label: "Materials", href: "/materials", icon: "package", phase: "Phase 14" },
      { id: "inventory", label: "Inventory", href: "/inventory", icon: "warehouse", phase: "Phase 13" },
    ],
  },
  {
    id: "procurement",
    label: "Procurement",
    items: [
      { id: "procurement", label: "Procurement", href: "/procurement", icon: "shopping-bag", phase: "Phase 15" },
      { id: "rfqs", label: "RFQs", href: "/rfqs", icon: "inbox", phase: "Phase 22" },
      { id: "purchase-orders", label: "Purchase Orders", href: "/purchase-orders", icon: "clipboard-list", phase: "Phase 23" },
      { id: "receiving", label: "Receiving", href: "/receiving", icon: "warehouse", phase: "Phase 24" },
      { id: "suppliers", label: "Suppliers", href: "/suppliers", icon: "building-2", phase: "Phase 16" },
      { id: "supplier-performance", label: "Supplier Performance", href: "/supplier-performance", icon: "chart-column", phase: "Phase 25" },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      { id: "forecast", label: "Forecast", href: "/forecast", icon: "chart-column", phase: "Phase 20" },
      { id: "scenarios", label: "Scenarios", href: "/scenarios", icon: "microscope", phase: "Phase 21" },
      { id: "ai", label: "AI Assistant", href: "/ai", icon: "sparkles", phase: "Phase 5" },
    ],
  },
  {
    id: "control",
    label: "Control",
    items: [
      { id: "approvals", label: "Approvals", href: "/approvals", icon: "shield-check", phase: "Phase 9" },
      { id: "communications", label: "Communications", href: "/communications", icon: "mail", phase: "Phase 11" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "governance", label: "Governance", href: "/governance", icon: "shield-check", phase: "Phase 36" },
      { id: "admin", label: "Administration", href: "/administration", icon: "users", phase: "Phase 38.1" },
      { id: "settings", label: "Settings", href: "/settings", icon: "settings", phase: "Phase 38.2" },
    ],
  },
];

export function getNavSections(): NavSection[] {
  return navSections;
}

export function findNavItem(href: string): NavItem | undefined {
  const exact = navSections.flatMap((section) => section.items).find((item) => item.href === href);
  if (exact) return exact;
  return navSections
    .flatMap((section) => section.items)
    .filter((item) => item.href !== "/" && href.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function findNavSection(href: string): NavSection | undefined {
  const item = findNavItem(href);
  if (!item) return undefined;
  return navSections.find((section) => section.items.some((row) => row.id === item.id));
}
