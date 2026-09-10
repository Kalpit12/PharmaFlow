import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ChartSurface({
  title,
  description,
  action,
  empty,
  error,
  children,
  className,
  dominant = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  empty?: string;
  error?: string;
  children?: ReactNode;
  className?: string;
  /** Larger analytical canvas for primary decision charts. */
  dominant?: boolean;
}) {
  return (
    <section className={cn("work-surface p-4 sm:p-5", dominant && "lg:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium tracking-tight">{title}</h2>
          {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className={cn("mt-3", dominant && "mt-4")}>
        {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
        {!error && empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
        {!error && !empty ? children : null}
      </div>
    </section>
  );
}
