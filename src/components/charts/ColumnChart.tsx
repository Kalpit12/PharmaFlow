import Link from "next/link";

import { ChartPlotFrame } from "@/components/charts/ChartPlotFrame";
import { ChartSurface } from "@/components/charts/ChartSurface";
import { formatAxisValue } from "@/lib/charts/axis";
import { chartBarFill, funnelStageBarClasses } from "@/lib/charts/tokens";
import type { ChartBarRow } from "@/lib/charts/types";
import { cn } from "@/lib/utils";

function formatValue(value: number): string {
  return value.toLocaleString("en-KE");
}

export function ColumnChart({
  title,
  description,
  rows,
  valueSuffix = "",
  emptyMessage = "No data available for this view.",
  embedded = false,
  dominant = false,
  maxColumns = 14,
}: {
  title: string;
  description?: string;
  rows: ChartBarRow[];
  valueSuffix?: string;
  emptyMessage?: string;
  embedded?: boolean;
  dominant?: boolean;
  maxColumns?: number;
}) {
  const visible = rows.slice(0, maxColumns);
  const max = Math.max(1, ...visible.map((row) => row.value));

  const plot = (
    <>
      <ChartPlotFrame maxValue={max} valueSuffix={valueSuffix} heightClass={dominant ? "min-h-[260px]" : "min-h-[220px]"}>
        {(scale) =>
          visible.map((row, index) => {
            const tone = row.tone ?? "default";
            const fill = chartBarFill[tone] ?? funnelStageBarClasses[index % funnelStageBarClasses.length];
            const heightPct = scale(row.value);
            return (
              <div key={row.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end px-0.5">
                <span className="mb-1 text-[10px] font-medium tabular-nums text-foreground">
                  {formatAxisValue(row.value, valueSuffix)}
                </span>
                <div
                  className={cn("w-full min-w-[1.1rem] max-w-[2.75rem] rounded-t-[2px] shadow-sm", fill)}
                  style={{ height: `${Math.max(heightPct, row.value > 0 ? 3 : 0)}%` }}
                  title={`${row.label}: ${formatValue(row.value)}${valueSuffix}`}
                />
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
            <Link
              key={row.id}
              href={row.href}
              className="min-w-0 flex-1 rounded-sm px-0.5 py-1 transition-colors hover:bg-muted/35"
              title={row.hint}
            >
              {label}
            </Link>
          ) : (
            <div key={row.id} className="min-w-0 flex-1 px-0.5">
              {label}
            </div>
          );
        })}
      </div>
    </>
  );

  const body =
    visible.length === 0 ? (
      <p className="text-sm text-muted-foreground">{emptyMessage}</p>
    ) : (
      <>
        {plot}
        {visible.some((row) => row.hint) ? (
          <ul className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
            {visible.slice(0, 6).map((row) =>
              row.hint ? (
                <li key={`hint-${row.id}`} className="truncate">
                  <span className="font-medium text-foreground">{row.label}:</span> {row.hint}
                </li>
              ) : null
            )}
          </ul>
        ) : null}
      </>
    );

  if (embedded) {
    return <div className="mt-3">{body}</div>;
  }

  if (visible.length === 0) {
    return <ChartSurface title={title} description={description} empty={emptyMessage} dominant={dominant} />;
  }

  return (
    <ChartSurface title={title} description={description} dominant={dominant}>
      {body}
    </ChartSurface>
  );
}
