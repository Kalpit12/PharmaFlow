"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/Breadcrumbs";
import { NotificationPopover } from "@/components/layout/NotificationPopover";
import { UserMenu } from "@/components/layout/UserMenu";
import { usePreferences } from "@/components/providers/preferences-provider";
import { useShell } from "@/components/layout/shell-context";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { Button } from "@/components/ui/button";
import { findNavItem, findNavSection } from "@/lib/mock/navigation";

export function Topbar() {
  const pathname = usePathname();
  const { setMobileNavOpen, workspace } = useShell();
  const { timeZone } = usePreferences();
  const breadcrumbs = useMemo(() => crumbsForPath(pathname), [pathname]);
  const context = useMemo(() => contextForPath(pathname, workspace.brand, timeZone), [pathname, workspace.brand, timeZone]);

  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-background px-3 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11 md:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu className="size-4" />
      </Button>

      <div className="hidden min-w-0 md:block lg:max-w-sm">
        <p className="truncate text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{context.tenant}</span>
          <span className="mx-1.5 text-border">/</span>
          <span>{context.section}</span>
        </p>
        <div className="sr-only">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 justify-center md:flex-none md:flex-1 lg:justify-center">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-2">
        <p className="hidden text-[11px] tabular-nums text-muted-foreground sm:block" suppressHydrationWarning>{context.stamp}</p>
        <NotificationPopover />
        <UserMenu />
      </div>
    </header>
  );
}

function contextForPath(pathname: string, brand: string, timeZonePreference: "utc" | "nairobi" | "local") {
  const item = findNavItem(pathname);
  const section = item ? findNavSection(item.href) : null;
  const timeZone = timeZonePreference === "utc" ? "UTC" : timeZonePreference === "nairobi" ? "Africa/Nairobi" : undefined;
  const zoneLabel = timeZonePreference === "utc" ? "UTC" : timeZonePreference === "nairobi" ? "EAT" : "Local";
  const stamp = new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
  return {
    tenant: brand,
    section: section?.label ?? item?.label ?? "Workspace",
    stamp: `${stamp} ${zoneLabel}`,
  };
}

function crumbsForPath(pathname: string): BreadcrumbItem[] {
  if (pathname.startsWith("/rfqs/")) {
    return [
      { label: "Procurement", href: "/procurement" },
      { label: "RFQs", href: "/rfqs" },
      { label: "RFQ detail" },
    ];
  }
  if (pathname.startsWith("/purchase-orders/")) {
    return [
      { label: "Procurement", href: "/procurement" },
      { label: "Purchase Orders", href: "/purchase-orders" },
      { label: "PO detail" },
    ];
  }
  if (pathname.startsWith("/receiving/")) {
    return [
      { label: "Procurement", href: "/procurement" },
      { label: "Receiving", href: "/receiving" },
      { label: "Receive goods" },
    ];
  }
  if (pathname === "/inventory/expiry" || pathname.startsWith("/inventory/")) {
    return [
      { label: "Operations" },
      { label: "Inventory", href: "/inventory" },
      ...(pathname.includes("expiry") ? [{ label: "Expiry" }] : []),
    ];
  }

  const item = findNavItem(pathname);
  if (!item) {
    return [{ label: "Pharmora" }];
  }

  const section = findNavSection(item.href);
  if (section?.label && section.id !== "overview") {
    return [{ label: section.label }, { label: item.label, href: item.href }];
  }

  return [{ label: item.label, href: item.href }];
}
