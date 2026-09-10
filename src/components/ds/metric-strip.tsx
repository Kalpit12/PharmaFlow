import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type MetricStripItem = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  href?: string;
  /** Color only where it carries meaning — most metrics stay neutral. */
  tone?: "default" | "danger" | "warning" | "success" | "primary" | "material";
};

export function MetricStrip({
  items,
  "aria-label": ariaLabel = "Key metrics",
  className,
}: {
  items: MetricStripItem[];
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn("flex min-w-0 gap-0 overflow-x-auto border-y border-border [scrollbar-width:thin]", className)}
    >
      {items.map((item, index) => {
        const inner = (
          <>
            <p className="label-context">{item.label}</p>
            <p
              className={cn(
                "metric-value mt-1.5 text-[1.65rem] leading-none sm:text-[1.85rem]",
                item.tone === "danger" && "text-danger",
                item.tone === "warning" && "text-warning",
                item.tone === "success" && "text-success",
                item.tone === "primary" && "text-primary",
                item.tone === "material" && "text-material"
              )}
            >
              {item.value}
            </p>
            {item.hint ? <p className="mt-1.5 max-w-[12rem] text-[11px] leading-snug text-muted-foreground">{item.hint}</p> : null}
          </>
        );
        const classNames = cn(
          "min-w-[8rem] flex-1 px-4 py-3.5 transition-colors",
          index > 0 && "border-l border-border",
          item.href && "hover:bg-muted/40"
        );
        if (item.href) {
          return (
            <Link key={item.id} href={item.href} className={classNames}>
              {inner}
            </Link>
          );
        }
        return (
          <div key={item.id} className={classNames}>
            {inner}
          </div>
        );
      })}
    </section>
  );
}

export function InlineStat({
  value,
  label,
  warning = false,
}: {
  value: ReactNode;
  label: string;
  warning?: boolean;
}) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span className={cn("metric-value text-lg", warning ? "text-danger" : null)}>{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </p>
  );
}
