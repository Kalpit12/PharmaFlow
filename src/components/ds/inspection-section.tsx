import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Standard detail-sheet section: IDENTITY · STATUS · METRICS · CONTEXT · HISTORY · ACTIONS
 */
export function InspectionSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2 border-t border-border/70 pt-4 first:border-t-0 first:pt-0", className)}>
      <h3 className="label-context">{title}</h3>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function InspectionMetricGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{item.label}</dt>
          <dd className="mt-0.5 text-sm leading-snug break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
