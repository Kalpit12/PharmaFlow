"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { demoTenant, getWorkspaceById, type TenantConfig } from "@/lib/tenant";

export type PaletteMode = "search" | "commands";

type ShellContextValue = {
  workspace: TenantConfig;
  setWorkspaceId: (id: string) => void;
  paletteOpen: boolean;
  paletteMode: PaletteMode;
  openPalette: (mode?: PaletteMode) => void;
  setPaletteOpen: (open: boolean) => void;
  setPaletteMode: (mode: PaletteMode) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState(demoTenant.id);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("commands");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const workspace = useMemo(() => getWorkspaceById(workspaceId), [workspaceId]);

  const openPalette = useCallback((mode: PaletteMode = "commands") => {
    setPaletteMode(mode);
    setPaletteOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => {
          if (open) return false;
          setPaletteMode("commands");
          return true;
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({
      workspace,
      setWorkspaceId,
      paletteOpen,
      paletteMode,
      openPalette,
      setPaletteOpen,
      setPaletteMode,
      mobileNavOpen,
      setMobileNavOpen,
    }),
    [workspace, paletteOpen, paletteMode, openPalette, mobileNavOpen]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error("useShell must be used within ShellProvider");
  }
  return context;
}
