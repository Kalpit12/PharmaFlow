import Link from "next/link";

import { cn } from "@/lib/utils";

export type ProcessTrailStep = {
  id: string;
  label: string;
  href?: string;
};

export function ProcessTrail({
  steps,
  current,
  className,
}: {
  steps: ProcessTrailStep[];
  current?: string;
  className?: string;
}) {
  const currentIndex = current ? steps.findIndex((step) => step.id === current) : -1;

  return (
    <ol className={cn("flex min-w-0 items-center gap-0 overflow-x-auto text-[11px] [scrollbar-width:thin]", className)}>
      {steps.map((step, index) => {
        const active = current ? step.id === current : false;
        const passed = currentIndex >= 0 && index < currentIndex;
        const label = (
          <span
            className={cn(
              "whitespace-nowrap tracking-[0.12em] uppercase",
              active ? "font-semibold text-primary" : passed ? "text-intel" : "text-muted-foreground"
            )}
          >
            {step.label}
          </span>
        );
        return (
          <li key={step.id} className="flex shrink-0 items-center gap-2">
            {index > 0 ? <span className="px-1.5 text-border" aria-hidden>→</span> : null}
            {step.href ? (
              <Link href={step.href} className="transition-colors hover:text-foreground">
                {label}
              </Link>
            ) : (
              label
            )}
          </li>
        );
      })}
    </ol>
  );
}
