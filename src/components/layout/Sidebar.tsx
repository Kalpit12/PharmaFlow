"use client";

import Link from "next/link";

import { useSession } from "next-auth/react";

import { SidebarNav } from "@/components/layout/SidebarNav";
import { useShell } from "@/components/layout/shell-context";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { initialsFromName, ROLE_LABEL } from "@/lib/auth/identity";
import { getMockUser } from "@/lib/mock/session";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/BrandLogo";

export function Sidebar({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        compact ? "w-14" : "w-[15.25rem]",
        className
      )}
    >
      <div className={cn("flex items-center gap-2.5 px-3 pt-5 pb-4", compact && "justify-center px-2")}>
        <BrandLogo href="/dashboard" compact={compact} />
      </div>

      <div className={cn("px-2 pb-3", compact && "px-1.5")}>
        <WorkspaceSwitcher compact={compact} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <SidebarNav compact={compact} />
      </div>

      <SidebarAccount compact={compact} />
    </aside>
  );
}

export function SidebarAccount({ compact = false }: { compact?: boolean }) {
  const { workspace } = useShell();
  const { data } = useSession();
  const fallback = getMockUser();
  const name = data?.user?.name ?? fallback.name;
  const role = data?.user?.role ? ROLE_LABEL[data.user.role] : fallback.role;
  const initials = initialsFromName(name);

  return (
    <div className={cn("border-t border-sidebar-border px-3 py-3", compact && "px-2")}>
      <p className={cn("truncate text-[11px] text-sidebar-foreground/45", compact && "sr-only")}>
        {workspace.brand}
      </p>
      <div className={cn("mt-2 flex items-center gap-2", compact && "justify-center")}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-sidebar-accent text-[10px] font-medium text-sidebar-accent-foreground">
          {initials}
        </span>
        <span className={cn("min-w-0", compact && "sr-only")}>
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="block truncate text-[11px] text-sidebar-foreground/50">{role}</span>
        </span>
      </div>
    </div>
  );
}
