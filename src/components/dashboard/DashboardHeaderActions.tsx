"use client";

import Link from "next/link";
import { ChartColumn, Sparkles } from "lucide-react";

import { useShell } from "@/components/layout/shell-context";
import { Button } from "@/components/ui/button";

export function DashboardHeaderActions() {
  const { openPalette } = useShell();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" className="min-h-11 sm:min-h-8">
        <Link href="/command-center">
          <ChartColumn data-icon="inline-start" />
          Command Center
        </Link>
      </Button>
      <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" onClick={() => openPalette("commands")}>
        <Sparkles data-icon="inline-start" />
        Interpret
      </Button>
    </div>
  );
}
