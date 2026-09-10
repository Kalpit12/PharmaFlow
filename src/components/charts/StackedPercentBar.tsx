import Link from "next/link";

import { ChartSurface } from "@/components/charts/ChartSurface";
import { chartBarFill } from "@/lib/charts/tokens";
import type { StackedSegment } from "@/lib/charts/types";
import { cn } from "@/lib/utils";

export function StackedPercentBar({
  title,
  description,
  segments,
  emptyMessage = "No inventory health data available.",
}: {
  title: string;
  description?: string;
  segments: StackedSegment[];
  emptyMessage?: string;
}) {
  const total = segments.reduce((sum, row) => sum + row.value, 0);

  if (total === 0) {
    return <ChartSurface title={title} description={description} empty={emptyMessage} />;
  }

  return (
    <ChartSurface title={title} description={description}>
      <div className="flex h-2.5 overflow-hidden rounded-sm bg-muted" role="img" aria-label={`${title} distribution`}>
        {segments
          .filter((row) => row.value > 0)
          .map((row) => (
            <div
              key={row.id}
              className={cn("h-full", chartBarFill[row.tone])}
              style={{ width: `${(row.value / total) * 100}%` }}
              title={`${row.label}: ${row.value.toLocaleString("en-KE")}`}
            />
          ))}
      </div>
      <ul className="mt-3 space-y-2">
        {segments.map((row) => {
          const share = total > 0 ? Math.round((row.value / total) * 100) : 0;
          const inner = (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("size-2 shrink-0 rounded-sm", chartBarFill[row.tone])} aria-hidden />
                <span className="truncate">{row.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {row.value.toLocaleString("en-KE")} · {share}%
              </span>
            </div>
          );
          return (
            <li key={row.id}>
              {row.href ? (
                <Link href={row.href} className="block rounded-sm py-0.5 transition-colors hover:bg-muted/40">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </ChartSurface>
  );
}
