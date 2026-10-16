"use client";

import { type ReactNode } from "react";

import type { AuthenticatedUser } from "@/lib/auth/identity";
import { Sidebar, SidebarAccount } from "@/components/layout/Sidebar";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { Topbar } from "@/components/layout/Topbar";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { ShellProvider, useShell } from "@/components/layout/shell-context";
import { CommandPalette } from "@/components/search/CommandPalette";
import { useClientReady } from "@/hooks/use-client-ready";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { X } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";

export function AppShell({
  children,
  user,
  initialWorkspaceId,
}: {
  children: ReactNode;
  user: AuthenticatedUser;
  initialWorkspaceId?: string;
}) {
  return (
    <ShellProvider user={user} initialWorkspaceId={initialWorkspaceId}>
      <ShellFrame>{children}</ShellFrame>
    </ShellProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const clientReady = useClientReady();
  const { navChromeHidden } = useShell();

  return (
    <div className="fixed inset-0 z-0 flex overflow-hidden bg-background">
      {clientReady && !navChromeHidden ? (
        <>
          <Sidebar compact className="hidden md:flex lg:hidden" />
          <Sidebar className="hidden lg:flex" />
        </>
      ) : clientReady && navChromeHidden ? null : (
        <>
          <aside
            className="hidden h-full w-14 shrink-0 border-r border-sidebar-border bg-sidebar md:flex lg:hidden"
            aria-hidden
          />
          <aside
            className="hidden h-full w-[15.25rem] shrink-0 border-r border-sidebar-border bg-sidebar lg:flex"
            aria-hidden
          />
        </>
      )}
      <MobileNav clientReady={clientReady} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="scrollbar-themed min-h-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</main>
      </div>
      {clientReady ? <CommandPalette /> : null}
    </div>
  );
}

function MobileNav({ clientReady }: { clientReady: boolean }) {
  const { mobileNavOpen, setMobileNavOpen } = useShell();

  return (
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[15.5rem] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-[15.5rem]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Pharmaflow primary navigation</SheetDescription>
        </SheetHeader>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-2 px-3 pt-4 pb-2">
            <div className="min-w-0">
              <BrandLogo href={null} compact={false} />
            </div>
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close navigation"
                className="min-h-11 min-w-11 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <X className="size-4" />
              </Button>
            </SheetClose>
          </div>
          <div className="px-2 pb-3">
            <WorkspaceSwitcher />
          </div>
          <div className="scrollbar-themed scrollbar-sidebar min-h-0 flex-1 overflow-y-auto pb-4">
            {clientReady ? <SidebarNav onNavigate={() => setMobileNavOpen(false)} /> : null}
          </div>
          <SidebarAccount />
        </div>
      </SheetContent>
    </Sheet>
  );
}
