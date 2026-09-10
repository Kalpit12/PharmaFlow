"use client";

import { Check, ChevronsUpDown } from "lucide-react";

import { useShell } from "@/components/layout/shell-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getWorkspaces } from "@/lib/tenant";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { workspace, setWorkspaceId } = useShell();
  const workspaces = getWorkspaces();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label="Switch workspace"
          className={cn(
            "h-auto w-full justify-start gap-2 rounded-lg px-2 py-1.5 text-left text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            compact && "justify-center px-0"
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-[10px] font-semibold text-sidebar-primary-foreground">
            {workspace.brand.slice(0, 2).toUpperCase()}
          </span>
          <span className={cn("min-w-0 flex-1", compact && "sr-only")}>
            <span className="block truncate text-[13px] font-medium">{workspace.brand}</span>
            <span className="block truncate text-[11px] text-sidebar-foreground/55">{workspace.country}</span>
          </span>
          <ChevronsUpDown className={cn("size-3.5 shrink-0 text-sidebar-foreground/40", compact && "hidden")} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((item) => (
          <DropdownMenuItem key={item.id} onClick={() => setWorkspaceId(item.id)}>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.brand}</span>
              <span className="block text-xs text-muted-foreground">{item.country}</span>
            </span>
            {item.id === workspace.id ? <Check className="size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
