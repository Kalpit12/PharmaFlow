"use client";

import type { ReactNode } from "react";

import { useLayoutMode } from "@/components/providers/preferences-provider";
import { cn } from "@/lib/utils";

export function DashboardPanel({
  title,
  subtitle,
  action,
  children,
  className,
  showSubtitleInSimple = false,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  showSubtitleInSimple?: boolean;
}) {
  const { simple } = useLayoutMode();
  const showSubtitle = subtitle && (!simple || showSubtitleInSimple);

  return (
    <section className={cn("work-surface min-w-0 p-4 sm:p-5", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium tracking-tight">{title}</h2>
          {showSubtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action ? <div className="min-w-0 shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}
