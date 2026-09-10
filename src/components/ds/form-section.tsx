import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-4 border-b border-border py-6 last:border-b-0 sm:grid-cols-[minmax(0,14rem)_1fr]", className)}>
      <header className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? <p className="text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </header>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}
