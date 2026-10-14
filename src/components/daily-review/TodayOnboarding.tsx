"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import { useLayoutMode } from "@/components/providers/preferences-provider";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "pharmaflow.onboarding.today.v1";

const STEPS = [
  { id: "attention", label: "Open the first item under Needs your attention" },
  { id: "search", label: "Press Ctrl+K (or ⌘K) to search the workspace" },
  { id: "settings", label: "Turn on Advanced layout in Settings when you want charts and detail" },
] as const;

export function TodayOnboarding() {
  const { layoutMode, ready } = useLayoutMode();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "done");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!ready || dismissed || layoutMode === "advanced") return null;

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      // optional
    }
    setDismissed(true);
  }

  return (
    <section className="work-surface border-primary/20 bg-primary/5 p-4 sm:p-5" aria-label="Getting started">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium tracking-tight">Welcome — start here</p>
          <p className="mt-1 text-sm text-muted-foreground">Three quick steps to learn the workspace.</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" onClick={finish} aria-label="Dismiss">
          <X className="size-4" />
        </Button>
      </div>
      <ol className="mt-4 space-y-2.5">
        {STEPS.map((step, index) => (
          <li key={step.id} className="flex gap-3 text-sm">
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[11px] font-medium tabular-nums"
              aria-hidden
            >
              {index + 1}
            </span>
            <span className="leading-relaxed text-foreground/90">{step.label}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" className="min-h-11 sm:min-h-8" onClick={finish}>
          <Check className="size-4" data-icon="inline-start" />
          Got it
        </Button>
        <Button asChild type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8">
          <Link href="/settings#preferences">Workspace settings</Link>
        </Button>
      </div>
    </section>
  );
}
