"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { useShell } from "@/components/layout/shell-context";
import { Button } from "@/components/ui/button";

export function GlobalSearch() {
  const { openPalette } = useShell();
  const [modifier, setModifier] = useState("Ctrl");

  useEffect(() => {
    const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
    setModifier(isMac ? "⌘" : "Ctrl");
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => openPalette("search")}
      aria-label="Search Pharmaflow"
      className="h-8 w-full max-w-md justify-start gap-2 rounded-sm border-border/80 px-2.5 font-normal text-muted-foreground hover:text-foreground"
    >
      <Search className="size-3.5" />
      <span className="flex-1 truncate text-left text-[13px]">Search workspace…</span>
      <kbd className="pointer-events-none hidden h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-sans text-[10px] text-muted-foreground sm:inline-flex">
        {modifier} K
      </kbd>
    </Button>
  );
}
