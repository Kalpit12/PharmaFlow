"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { navIcons } from "@/components/layout/nav-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hasPermission, navPermissionForHref } from "@/lib/auth/permissions";
import { getNavSections, type NavItem } from "@/lib/mock/navigation";
import { cn } from "@/lib/utils";

function isActivePath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard" || href === "/command-center") return false;
  return pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role ?? null;
  const sections = getNavSections()
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.comingSoon) return true;
        const permission = navPermissionForHref(item.href);
        return !permission || hasPermission(role, permission);
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <nav aria-label="Primary" className="flex flex-col gap-4 px-2 pb-4">
      {sections.map((section) => (
        <div key={section.id} className="space-y-0.5">
          {section.label ? (
            <p
              className={cn(
                "px-2 pb-1.5 text-[9px] font-medium tracking-[0.18em] text-sidebar-foreground/35 uppercase",
                compact && "sr-only"
              )}
            >
              {section.label}
            </p>
          ) : null}
          <ul>
            {section.items.map((item) => {
              const Icon = navIcons[item.icon];
              const active = isActivePath(pathname, item.href);
              const className = cn(
                "group relative flex min-h-9 items-center gap-2.5 px-2 text-[13px] transition-colors duration-150",
                compact && "min-h-10 justify-center px-0",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              );

              const content = (
                <>
                  {active ? (
                    <span className="absolute inset-y-1.5 left-0 w-0.5 bg-sidebar-primary" aria-hidden />
                  ) : null}
                  <Icon className={cn("size-3.5 shrink-0", active ? "opacity-100" : "opacity-70")} />
                  <span className={cn("min-w-0 flex-1 truncate", compact && "sr-only")}>{item.label}</span>
                  {item.comingSoon && !compact ? (
                    <span className="text-[9px] font-medium tracking-wide text-sidebar-foreground/35 uppercase">
                      Soon
                    </span>
                  ) : null}
                </>
              );

              if (!compact) {
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={className}
                    >
                      {content}
                    </Link>
                  </li>
                );
              }

              return (
                <li key={item.id}>
                  <CompactNavLink item={item} active={active} className={className} onNavigate={onNavigate}>
                    {content}
                  </CompactNavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function CompactNavLink({
  item,
  active,
  className,
  onNavigate,
  children,
}: {
  item: NavItem;
  active: boolean;
  className: string;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          onClick={onNavigate}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          className={className}
        >
          {children}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
