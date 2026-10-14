import type { ReactNode } from "react";

import { axisTicks, formatAxisValue } from "@/lib/charts/axis";
import { cn } from "@/lib/utils";

const X_AXIS = "1.75rem";

export function ChartPlotFrame({
  maxValue,
  valueSuffix = "",
  heightClass = "min-h-[220px]",
  children,
  className,
}: {
  maxValue: number;
  valueSuffix?: string;
  heightClass?: string;
  children: (scale: (value: number) => number) => ReactNode;
  className?: string;
}) {
  const ticks = axisTicks(maxValue);
  const top = ticks[ticks.length - 1] ?? 1;
  const scale = (value: number) => Math.max(0, Math.min(100, (value / top) * 100));

  return (
    <div className={cn("flex gap-2", className)}>
      <div
        className="flex w-11 shrink-0 flex-col-reverse justify-between text-[10px] leading-none tabular-nums text-muted-foreground"
        style={{ paddingBottom: X_AXIS, paddingTop: "0.25rem" }}
        aria-hidden
      >
        {ticks.map((tick, index) => (
          <span key={`tick-label-${index}`}>{formatAxisValue(tick, valueSuffix)}</span>
        ))}
      </div>
      <div className={cn("relative flex-1 border-l border-b border-border/90 bg-muted/[0.06]", heightClass)}>
        {ticks.map((tick, index) => (
          <div
            key={`grid-${index}`}
            className="pointer-events-none absolute right-0 left-0 border-t border-border/45"
            style={{ bottom: `calc(${X_AXIS} + (100% - ${X_AXIS} - 0.25rem) * ${scale(tick)} / 100)` }}
          />
        ))}
        <div
          className="absolute inset-x-0 top-1 flex items-end justify-around gap-1 px-1.5 sm:px-2"
          style={{ bottom: X_AXIS }}
        >
          {children(scale)}
        </div>
      </div>
    </div>
  );
}
