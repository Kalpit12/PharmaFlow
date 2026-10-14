import Link from "next/link";

import { ChartPlotFrame } from "@/components/charts/ChartPlotFrame";
import { ChartSurface } from "@/components/charts/ChartSurface";
import { formatAxisValue } from "@/lib/charts/axis";
import { groupedBarPrimaryClass, groupedBarSecondaryClass } from "@/lib/charts/tokens";
import type { GroupedBarRow } from "@/lib/charts/types";
import { cn } from "@/lib/utils";

function formatQty(value: number): string {
  return value.toLocaleString("en-KE");
}

export function ClusteredColumnChart({
  title,
  description,
  rows,
  primaryLabel = "Planned",
  secondaryLabel = "Produced",
  emptyMessage = "No production data available.",
  note,
  maxColumns = 10,
}: {
  title: string;
  description?: string;
  rows: GroupedBarRow[];
  primaryLabel?: string;
  secondaryLabel?: string;
  emptyMessage?: string;
  note?: string;
  maxColumns?: number;
}) {
  const visible = rows.slice(0, maxColumns);
  const max = Math.max(1, ...visible.flatMap((row) => [row.primary, row.secondary ?? 0]));

  if (visible.length === 0) {
    return <ChartSurface title={title} description={description} empty={emptyMessage} />;
  }

  return (
    <ChartSurface title={title} description={description}>
      <ChartPlotFrame maxValue={max}>
        {(scale) =>
          visible.map((row) => {
            const primaryH = scale(row.primary);
            const secondaryH = row.secondary != null ? scale(row.secondary) : 0;
            return (
              <div key={row.id} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 sm:gap-1">
                <div className="flex h-full w-[42%] max-w-[1.35rem] flex-col items-center justify-end">
                  <span className="mb-0.5 text-[9px] tabular-nums text-muted-foreground">{formatAxisValue(row.primary)}</span>
                  <div
                    className={cn("w-full rounded-t-[2px]", groupedBarPrimaryClass)}
                    style={{ height: `${Math.max(primaryH, row.primary > 0 ? 3 : 0)}%` }}
                    title={`${primaryLabel}: ${formatQty(row.primary)}`}
                  />
                </div>
                {row.secondary != null ? (
                  <div className="flex h-full w-[42%] max-w-[1.35rem] flex-col items-center justify-end">
                    <span className="mb-0.5 text-[9px] tabular-nums text-muted-foreground">{formatAxisValue(row.secondary)}</span>
                    <div
                      className={cn("w-full rounded-t-[2px]", groupedBarSecondaryClass)}
                      style={{ height: `${Math.max(secondaryH, row.secondary > 0 ? 3 : 0)}%` }}
                      title={`${secondaryLabel}: ${formatQty(row.secondary)}`}
                    />
                  </div>
                ) : (
                  <div className="flex h-full w-[42%] max-w-[1.35rem] flex-col items-center justify-end opacity-40">
                    <div className="w-full rounded-t-[2px] bg-muted" style={{ height: "4%" }} title="Produced pending" />
                  </div>
                )}
              </div>
            );
          })
        }
      </ChartPlotFrame>
      <div className="mt-1.5 flex gap-2 pl-[calc(2.75rem+0.5rem)]">
        {visible.map((row) => {
          const label = (
            <span className="line-clamp-2 min-w-0 flex-1 text-center text-[10px] leading-tight text-muted-foreground">
              {row.label}
            </span>
          );
          return row.href ? (
            <Link key={row.id} href={row.href} className="min-w-0 flex-1 rounded-sm px-0.5 py-1 transition-colors hover:bg-muted/35">
              {label}
            </Link>
          ) : (
            <div key={row.id} className="min-w-0 flex-1 px-0.5">
              {label}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-sm", groupedBarPrimaryClass)} aria-hidden />
          {primaryLabel}
        </li>
        <li className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-sm", groupedBarSecondaryClass)} aria-hidden />
          {secondaryLabel}
        </li>
      </ul>
      {note ? <p className="mt-2 text-[11px] text-muted-foreground">{note}</p> : null}
    </ChartSurface>
  );
}
