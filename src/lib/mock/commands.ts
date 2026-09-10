export type CommandKind = "action" | "navigation";

export type CommandItem = {
  id: string;
  label: string;
  kind: CommandKind;
  href?: string;
  comingSoon?: boolean;
  group: "Quick Actions" | "Navigation";
};

export const commandItems: CommandItem[] = [
  { id: "open-command-center", label: "Open Command Center", kind: "action", href: "/command-center", group: "Quick Actions" },
  { id: "open-daily-review", label: "Open Daily Review", kind: "action", href: "/daily-review", group: "Quick Actions" },
  { id: "open-reports", label: "Open Reports", kind: "action", href: "/reports", group: "Quick Actions" },
  { id: "open-operations", label: "Open Operations", kind: "action", href: "/operations", group: "Quick Actions" },
  { id: "open-materials", label: "Open Materials", kind: "action", href: "/materials", group: "Quick Actions" },
  { id: "open-inventory", label: "Open Inventory", kind: "action", href: "/inventory", group: "Quick Actions" },
  { id: "open-procurement", label: "Open Procurement", kind: "action", href: "/procurement", group: "Quick Actions" },
  { id: "open-rfqs", label: "Open RFQs", kind: "action", href: "/rfqs", group: "Quick Actions" },
  { id: "open-purchase-orders", label: "Open Purchase Orders", kind: "action", href: "/purchase-orders", group: "Quick Actions" },
  { id: "open-receiving", label: "Open Receiving", kind: "action", href: "/receiving", group: "Quick Actions" },
  { id: "open-suppliers", label: "Open Suppliers", kind: "action", href: "/suppliers", group: "Quick Actions" },
  { id: "open-supplier-performance", label: "Open Supplier Performance", kind: "action", href: "/supplier-performance", group: "Quick Actions" },
  { id: "open-forecast", label: "Open Forecast", kind: "action", href: "/forecast", group: "Quick Actions" },
  { id: "open-scenarios", label: "Open Scenarios", kind: "action", href: "/scenarios", group: "Quick Actions" },
  { id: "open-execution", label: "Open Execution", kind: "action", href: "/execution", group: "Quick Actions" },
  { id: "open-ai", label: "Open AI Assistant", kind: "action", href: "/ai", group: "Quick Actions" },
  { id: "open-approvals", label: "Open Approvals", kind: "action", href: "/approvals", group: "Quick Actions" },
  { id: "open-communications", label: "Open Communications", kind: "action", href: "/communications", group: "Quick Actions" },
  { id: "create-rfq", label: "Create RFQ", kind: "action", href: "/rfqs", group: "Quick Actions" },
  { id: "go-command", label: "Go to Command Center", kind: "navigation", href: "/command-center", group: "Navigation" },
  { id: "go-overview", label: "Go to Dashboard", kind: "navigation", href: "/dashboard", group: "Navigation" },
];

export function filterCommands(query: string): CommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return commandItems;
  return commandItems.filter((item) => item.label.toLowerCase().includes(q));
}
